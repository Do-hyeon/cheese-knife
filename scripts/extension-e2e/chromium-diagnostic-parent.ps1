function Invoke-ChromiumDiagnosticStartupProbe {
    param(
        [Parameter(Mandatory)][string]$NodePath,
        [Parameter(Mandatory)][string]$EntryPath,
        [Parameter(Mandatory)][string]$WorkingDirectory,
        [Parameter(Mandatory)][long]$StartedTick
    )
    $ErrorActionPreference = 'Stop'
    $utf8 = [Text.UTF8Encoding]::new($false, $true)
    $frequency = [Diagnostics.Stopwatch]::Frequency
    function Elapsed-Ms {
        ([decimal]([Diagnostics.Stopwatch]::GetTimestamp() - $StartedTick) * 1000) / $frequency
    }
    function Assert-Before([int]$Cutoff) {
        $elapsed = Elapsed-Ms
        if ($elapsed -lt 0 -or $elapsed -ge $Cutoff) { throw 'diagnostic-parent-deadline' }
    }
    function Wait-Within($Task, [int]$Cutoff) {
        Assert-Before $Cutoff
        $left = [double]($Cutoff - (Elapsed-Ms))
        $result = $Task.WaitAsync([TimeSpan]::FromMilliseconds([Math]::Max(0, $left))).GetAwaiter().GetResult()
        Assert-Before $Cutoff
        return $result
    }
    function Read-Frame($Stream, [int]$Cutoff, [bool]$AllowEof = $false) {
        $bytes = [byte[]]::new(512)
        for ($length = 0; $length -lt $bytes.Length; $length++) {
            Assert-Before $Cutoff
            $read = Wait-Within ($Stream.ReadAsync($bytes, $length, 1)) $Cutoff
            if ($read -eq 0) {
                if ($AllowEof -and $length -eq 0) { return }
                throw 'diagnostic-parent-frame'
            }
            if ($bytes[$length] -eq 10) {
                return ConvertFrom-Json -AsHashtable -InputObject ($utf8.GetString($bytes, 0, $length))
            }
            if ($AllowEof) { throw 'diagnostic-parent-trailing-frame' }
        }
        throw 'diagnostic-parent-frame-bound'
    }
    function Is-Number($Value) {
        ($Value -is [long] -or $Value -is [double]) -and [double]::IsFinite([double]$Value)
    }
    foreach ($target in $NodePath,$EntryPath,$WorkingDirectory) {
        if ($target -notmatch '^[a-z]:\\' -or [IO.Path]::GetFullPath($target) -cne $target) {
            throw 'diagnostic-parent-path'
        }
    }
    $nonce = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $NodePath
    $info.WorkingDirectory = $WorkingDirectory
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardInputEncoding = $utf8
    $info.ArgumentList.Add($EntryPath)
    $info.Environment.Clear()
    $info.Environment.Add('SystemRoot', 'C:\Windows')
    $info.Environment.Add('windir', 'C:\Windows')
    $info.Environment.Add('Path', 'C:\Windows\System32')
    $info.Environment.Add('CK_STARTUP_NONCE', $nonce)

    $child = [Diagnostics.Process]::new()
    $child.StartInfo = $info
    $first = $null
    $closureError = $null
    $reply = $null
    $owned = $false
    $stdoutEof = $false
    $stderrEof = $false
    $pidObserved = $null
    $exitCode = $null
    $originMs = $null
    try {
        Assert-Before 150000
        if (!$child.Start()) { throw 'diagnostic-parent-spawn' }
        $owned = $true
        $pidObserved = $child.Id
        $stderr = $child.StandardError.BaseStream.ReadAsync([byte[]]::new(1), 0, 1)
        $stdout = $child.StandardOutput.BaseStream
        $ready = Read-Frame $stdout 150000
        if ($ready.Count -ne 2 -or $ready.type -cne 'ready' -or $ready.nonce -cne $nonce) {
            throw 'diagnostic-parent-ready'
        }
        $originMs = [int][Math]::Ceiling((Elapsed-Ms))
        if ($originMs -ge 150000) { throw 'diagnostic-parent-deadline' }
        $origin = [ordered]@{ type='origin'; nonce=$nonce; elapsedMs=$originMs }
        $message = $utf8.GetBytes((ConvertTo-Json -InputObject $origin -Compress) + [char]10)
        [void](Wait-Within ($child.StandardInput.BaseStream.WriteAsync($message, 0, $message.Length)) 150000)
        $child.StandardInput.Close()
        $reply = Read-Frame $stdout 150000
        if ($reply.Count -ne 6 -or $reply.type -cne 'hold' -or $reply.nonce -cne $nonce -or
            $reply.reason -cne 'download-before-file-init-unproved' -or !(Is-Number $reply.chromiumLaunches) -or
            $reply.chromiumLaunches -ne 0 -or !(Is-Number $reply.started) -or !(Is-Number $reply.elapsedMs) -or
            $reply.elapsedMs -lt $originMs -or $reply.elapsedMs -ge 150000) { throw 'diagnostic-parent-result' }
        [void](Read-Frame $stdout 240000 $true)
        $stdoutEof = $true
    } catch {
        $first = $_.Exception.Message
    } finally {
        if ($owned) {
            try {
                $child.StandardInput.Close()
                [void](Wait-Within ($child.WaitForExitAsync()) 240000)
                $exitCode = $child.ExitCode
                $stderrEof = (Wait-Within $stderr 240000) -eq 0
                if (!$stdoutEof -or !$stderrEof -or $exitCode -ne 0) { throw 'diagnostic-parent-closure' }
            } catch {
                $closureError = $_.Exception.Message
            }
        }
        $child.Dispose()
    }
    $confirmed = $owned -and $null -eq $closureError -and $stdoutEof -and $stderrEof -and $exitCode -eq 0
    [ordered]@{
        status='HOLD'; handshakeVerified=$null -eq $first -and $confirmed
        originMs=$originMs; parentElapsedMs=[double](Elapsed-Ms)
        nodePid=$pidObserved; exitCode=$exitCode; stdoutEof=$stdoutEof; stderrEof=$stderrEof
        closure=if ($confirmed) {'CONFIRMED'} else {'UNKNOWN'}
        reason=$reply.reason; childStarted=$reply.started; childElapsedMs=$reply.elapsedMs; chromiumLaunches=0
        firstError=$first; closureError=$closureError
    }
}

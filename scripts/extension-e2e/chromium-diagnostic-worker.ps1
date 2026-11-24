param([Parameter(Mandatory)][ValidateSet('reserve','scan')][string]$Lane)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$slotBytes = 65536
$stream = $null
$sequence = 0
$nextWrite = 0
$flushPending = $false

if ($Lane -eq 'reserve') {
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

public static class DiagnosticNtfs {
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetFileInformationByHandleEx(SafeFileHandle h, int kind, byte[] data, uint size);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    static extern bool GetVolumeInformationByHandleW(SafeFileHandle h, IntPtr name, uint nameSize,
        out uint serial, out uint maxComponent, out uint flags, StringBuilder fs, uint fsSize);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    static extern uint GetFinalPathNameByHandleW(SafeFileHandle h, StringBuilder name, uint size, uint flags);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    static extern bool GetDiskFreeSpaceW(string root, out uint sectors, out uint sectorBytes,
        out uint free, out uint total);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool DeviceIoControl(SafeFileHandle h, uint code, byte[] input, uint inSize,
        byte[] output, uint outSize, out uint size, IntPtr overlapped);

    static byte[] Info(SafeFileHandle h, int kind, uint length) {
        var data = new byte[length];
        if (!GetFileInformationByHandleEx(h, kind, data, length))
            throw new IOException("reserve-fileinfo-" + kind + "-" + Marshal.GetLastWin32Error());
        return data;
    }
    public static object Inspect(FileStream stream, string path) {
        var h = stream.SafeFileHandle;
        var name = new StringBuilder(32768);
        var length = GetFinalPathNameByHandleW(h, name, (uint)name.Capacity, 0);
        if (length == 0 || length >= name.Capacity ||
            !String.Equals(name.ToString(), @"\\?\" + path, StringComparison.OrdinalIgnoreCase))
            throw new IOException("reserve-path");
        var fs = new StringBuilder(32);
        if (!GetVolumeInformationByHandleW(h, IntPtr.Zero, 0, out _, out _, out _, fs, (uint)fs.Capacity) ||
            fs.ToString() != "NTFS") throw new IOException("reserve-volume");
        var standard = Info(h, 1, 24);
        var allocatedBytes = BitConverter.ToInt64(standard, 0);
        if (allocatedBytes != 131072 || BitConverter.ToInt64(standard, 8) != 131072 ||
            BitConverter.ToUInt32(standard, 16) != 1 || standard[20] != 0 || standard[21] != 0)
            throw new IOException("reserve-file-shape");
        var attributes = BitConverter.ToUInt32(Info(h, 9, 8), 0);
        if ((attributes & 0x5e50U) != 0) throw new IOException("reserve-attributes");
        name.Clear();
        length = GetFinalPathNameByHandleW(h, name, (uint)name.Capacity, 1);
        var volume = name.ToString();
        var end = volume.IndexOf('}', 0);
        if (length == 0 || length >= name.Capacity || end < 0 ||
            !volume.StartsWith(@"\\?\Volume{", StringComparison.OrdinalIgnoreCase) ||
            !GetDiskFreeSpaceW(volume.Substring(0, end + 1) + "\\", out uint sectors, out uint bytes, out _, out _))
            throw new IOException("reserve-cluster-size");
        var clusterBytes = (long)sectors * bytes;
        var extents = new byte[4096];
        if (!DeviceIoControl(h, 0x90073, new byte[8], 8, extents, (uint)extents.Length, out uint size, IntPtr.Zero))
            throw new IOException("reserve-extents-" + Marshal.GetLastWin32Error());
        var count = BitConverter.ToUInt32(extents, 0);
        if (size < 32 || count == 0 || count > (size - 16) / 16 || BitConverter.ToInt64(extents, 8) != 0)
            throw new IOException("reserve-extents-format");
        long clusters = 0;
        for (int i = 0; i < count; i++) {
            var next = BitConverter.ToInt64(extents, 16 + i * 16);
            var lcn = BitConverter.ToInt64(extents, 24 + i * 16);
            if (next <= clusters || lcn < 0) throw new IOException("reserve-extents-hole");
            clusters = next;
        }
        if (clusterBytes != 4096 || clusters != allocatedBytes / clusterBytes)
            throw new IOException("reserve-extents-coverage");
        var identity = Info(h, 18, 24);
        var id = new byte[16];
        Array.Copy(identity, 8, id, 0, id.Length);
        Array.Reverse(id);
        return new { fileId = Convert.ToHexString(id).ToLowerInvariant(),
            volumeSerial = BitConverter.ToUInt64(identity, 0).ToString("x16"),
            allocatedBytes, clusterBytes, clusters, extentCount = count };
    }
}
'@
}

function Get-ReserveBytes([int]$Position, [int]$Length) {
    $bytes = [byte[]]::new($Length)
    $stream.Position = $Position
    $stream.ReadExactly($bytes, 0, $Length)
    return ,$bytes
}
function Get-Digest([byte[]]$Bytes) {
    [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Bytes)).ToLowerInvariant()
}
function Send-Reply($Value) {
    [Console]::WriteLine((ConvertTo-Json -InputObject $Value -Compress -Depth 4))
}

try {
    while ($null -ne ($line = [Console]::ReadLine())) {
        if ($line.Length -gt 180000) { throw 'worker-request-bound' }
        $request = ConvertFrom-Json -InputObject $line -AsHashtable
        if ($request.seq -ne (++$sequence)) { throw 'worker-request-sequence' }
        if ($sequence -eq 1) {
            if ($request.op -ne 'open') { throw 'worker-request-open' }
            if ($Lane -eq 'reserve') {
                $reservePath = [string]$request.path
                if ($reservePath -notmatch '^[a-z]:\\' -or [IO.Path]::GetFullPath($reservePath) -cne $reservePath) { throw 'reserve-path' }
                if ($request.readOnly -isnot [bool] -or ($request.readOnly -and !$request.fileId)) { throw 'reserve-mode' }
                $readOnly = $request.readOnly
                $access = if ($readOnly) { [IO.FileAccess]::Read } else { [IO.FileAccess]::ReadWrite }
                $stream = [IO.FileStream]::new($reservePath, [IO.FileMode]::Open, $access, [IO.FileShare]::None, 1, [IO.FileOptions]::WriteThrough)
                $allocation = [DiagnosticNtfs]::Inspect($stream, $reservePath)
                if ($request.fileId -and $allocation.fileId -cne $request.fileId) { throw 'reserve-file-id' }
                if ($request.volumeSerial -and $allocation.volumeSerial -cne $request.volumeSerial) { throw 'reserve-volume-id' }
                if ((Get-Digest (Get-ReserveBytes 0 (2*$slotBytes))) -cne $request.sha256) { throw 'reserve-initial-bytes' }
                $result = $allocation
            } else {
                $runRoot = [string]$request.root
                $source = [IO.FileStream]::new([string]$request.path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
                try {
                    if ($source.Length -lt 1 -or $source.Length -gt 16384) { throw 'scanner-source-size' }
                    $bytes = [byte[]]::new($source.Length)
                    $source.ReadExactly($bytes, 0, $bytes.Length)
                } finally { $source.Dispose() }
                if ((Get-Digest $bytes) -cne $request.sha256) { throw 'scanner-source-bytes' }
                . ([ScriptBlock]::Create([Text.UTF8Encoding]::new($false, $true).GetString($bytes)))
                $result = $true
            }
        } elseif ($Lane -eq 'scan') {
            if ($request.op -ne 'scan' -or $request.ms -lt 1 -or $request.ms -gt 1000) { throw 'scanner-request' }
            $scanBy = [Diagnostics.Stopwatch]::GetTimestamp() +
                [long][Math]::Floor($request.ms * [Diagnostics.Stopwatch]::Frequency / 1000)
            $result = Measure-ChromiumCompatRaw -RunRoot $runRoot -ScanByTick $scanBy
            if ($result.observedTick -ge $scanBy -or [Diagnostics.Stopwatch]::GetTimestamp() -ge $scanBy) { throw 'raw-scan-deadline' }
        } else {
            $position = $request.position
            switch ($request.op) {
                'read' {
                    if ($flushPending -or !(($position -in 0,$slotBytes -and $request.length -eq $slotBytes) -or
                        ($position -eq 0 -and $request.length -eq 2*$slotBytes))) { throw 'reserve-read-range' }
                    $result = [Convert]::ToBase64String((Get-ReserveBytes $position $request.length))
                }
                'write' {
                    if ($readOnly -or $flushPending -or $position -notin 0,$slotBytes -or $position -ne $nextWrite) { throw 'reserve-write-range' }
                    $bytes = [Convert]::FromBase64String($request.bytes)
                    if ($bytes.Length -ne $slotBytes) { throw 'reserve-write-size' }
                    $nextWrite += $slotBytes
                    $flushPending = $true
                    $stream.Position = $position
                    $stream.Write($bytes, 0, $bytes.Length)
                    $result = $bytes.Length
                }
                'sync' {
                    if ($readOnly -or !$flushPending) { throw 'reserve-write-range' }
                    $stream.Flush($true)
                    $verified = [DiagnosticNtfs]::Inspect($stream, $reservePath)
                    if ($verified.fileId -cne $allocation.fileId -or $verified.volumeSerial -cne $allocation.volumeSerial) { throw 'reserve-file-id' }
                    $flushPending = $false
                    $result = $true
                }
                default { throw 'reserve-request' }
            }
        }
        Send-Reply @{ seq=$sequence; value=$result }
    }
} catch {
    $reason = $_.Exception
    while ($reason.InnerException) { $reason = $reason.InnerException }
    $message = $reason.Message
    if ($message -notmatch '^[a-z0-9-]{1,80}$') { $message = "$Lane-io-failed" }
    Send-Reply @{ seq=$sequence; error=$message }
    exit 1
} finally {
    if ($stream) { $stream.Dispose() }
}

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#define _WIN32_WINNT 0x0A00
#include <windows.h>
#include <io.h>
#include <atomic>
#include <cstddef>
#include <cstdio>
#include <vector>
#include "run-job-owner.h"

namespace {
HANDLE job = nullptr;
HANDLE root = nullptr;
HANDLE output = INVALID_HANDLE_VALUE;
DWORD rootPid = 0;
std::uint64_t created = 0;
char nonce[65] = {};
std::uint32_t sequence = 0;

[[noreturn]] void stop() {
    // No locks or output here: parent loss must also stop a blocked main thread.
    TerminateProcess(GetCurrentProcess(), 1);
    for (;;) {}
}

void write_line(const char* line, int size) {
    if (size <= 0 || size >= 512) stop();
    DWORD written = 0;
    if (!WriteFile(output, line, static_cast<DWORD>(size), &written, nullptr) ||
        written != static_cast<DWORD>(size)) stop();
}

[[noreturn]] void fail(DWORD code) {
    // Close ownership before reporting; stdout may be blocked or disconnected.
    if (job) { CloseHandle(job); job = nullptr; }
    char line[512];
    const int size = std::snprintf(line, sizeof(line),
        "{\"v\":1,\"nonce\":\"%s\",\"seq\":%u,\"event\":\"error\",\"code\":%lu}\n",
        nonce, sequence, code);
    write_line(line, size);
    ExitProcess(1);
}

void check(BOOL ok) { if (!ok) fail(GetLastError()); }

struct Mailbox {
    HANDLE input = nullptr;
    HANDLE event = nullptr;
    std::atomic<unsigned> status{0}; // empty, writing, ready
    run_job::Command command;
};
// Process lifetime keeps the reader valid even while the main stack unwinds.
Mailbox mailbox;

DWORD WINAPI read_control(void* argument) {
    auto& control = *static_cast<Mailbox*>(argument);
    char line[12];
    std::size_t length = 0;
    for (;;) {
        char bytes[64];
        DWORD count = 0;
        if (!ReadFile(control.input, bytes, sizeof(bytes), &count, nullptr) || count == 0) stop();
        for (DWORD i = 0; i < count; ++i) {
            if (bytes[i] == '\n') {
                const auto command = run_job::parse_command({line, length});
                if (!command.kind) stop();
                unsigned empty = 0;
                if (!control.status.compare_exchange_strong(empty, 1)) stop();
                control.command = command;
                control.status.store(2, std::memory_order_release);
                if (!SetEvent(control.event)) stop();
                length = 0;
            } else {
                if (length == sizeof(line)) stop();
                line[length++] = bytes[i];
            }
        }
    }
}

std::uint64_t creation_time(HANDLE process) {
    FILETIME creation, exit, kernel, user;
    check(GetProcessTimes(process, &creation, &exit, &kernel, &user));
    return (static_cast<std::uint64_t>(creation.dwHighDateTime) << 32) | creation.dwLowDateTime;
}

using run_job::Observation;
Observation observe() {
    if (GetProcessId(root) != rootPid || creation_time(root) != created) fail(ERROR_INVALID_DATA);
    return run_job::read_observation([] {
        JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting{};
        check(QueryInformationJobObject(job, JobObjectBasicAccountingInformation,
            &accounting, sizeof(accounting), nullptr));
        if (accounting.TotalProcesses == 0 || accounting.ActiveProcesses > accounting.TotalProcesses)
            fail(ERROR_INVALID_DATA);
        return Observation{accounting.ActiveProcesses, accounting.TotalProcesses, false};
    }, [] {
        const DWORD wait = WaitForSingleObject(root, 0);
        if (wait != WAIT_OBJECT_0 && wait != WAIT_TIMEOUT) fail(ERROR_INVALID_DATA);
        return wait == WAIT_OBJECT_0;
    });
}

void emit(const char* event, Observation observation, bool aborted) {
    char line[512];
    int size;
    if (sequence == 0) {
        size = std::snprintf(line, sizeof(line),
            "{\"v\":1,\"nonce\":\"%s\",\"seq\":0,\"event\":\"ready\",\"pid\":%lu,\"created\":\"%016llx\",\"helperPid\":%lu,\"helperCreated\":\"%016llx\",\"active\":%lu,\"total\":%lu}\n",
            nonce, rootPid, static_cast<unsigned long long>(created), GetCurrentProcessId(),
            static_cast<unsigned long long>(creation_time(GetCurrentProcess())), static_cast<unsigned long>(observation.active), static_cast<unsigned long>(observation.total));
    } else {
        size = std::snprintf(line, sizeof(line),
            "{\"v\":1,\"nonce\":\"%s\",\"seq\":%u,\"event\":\"%s\",\"pid\":%lu,\"created\":\"%016llx\",\"active\":%lu,\"total\":%lu,\"rootExited\":%s,\"aborted\":%s}\n",
            nonce, sequence, event, rootPid, static_cast<unsigned long long>(created),
            static_cast<unsigned long>(observation.active), static_cast<unsigned long>(observation.total), observation.rootExited ? "true" : "false", aborted ? "true" : "false");
    }
    write_line(line, size);
}

void sample_job_members() {
    struct {
        DWORD assigned;
        DWORD listed;
        ULONG_PTR pids[2];
    } members{};
    static_assert(offsetof(decltype(members), pids) == offsetof(JOBOBJECT_BASIC_PROCESS_ID_LIST, ProcessIdList));
    static_assert(sizeof(members) == sizeof(JOBOBJECT_BASIC_PROCESS_ID_LIST) + sizeof(ULONG_PTR));
    if (!QueryInformationJobObject(job, JobObjectBasicProcessIdList, &members, sizeof(members), nullptr) ||
        !run_job::valid_member_pids(members.assigned, members.listed, members.pids[0], members.pids[1], rootPid))
        return;
    char line[512];
    const int size = std::snprintf(line, sizeof(line),
        "{\"v\":1,\"nonce\":\"%s\",\"seq\":%u,\"event\":\"job-members\",\"pid\":%lu,\"created\":\"%016llx\",\"pids\":[%lu,%lu]}\n",
        nonce, sequence, rootPid, static_cast<unsigned long long>(created),
        static_cast<unsigned long>(members.pids[0]), static_cast<unsigned long>(members.pids[1]));
    write_line(line, size);
}

HANDLE inherited_copy(HANDLE source) {
    if (!source || source == INVALID_HANDLE_VALUE) fail(ERROR_INVALID_HANDLE);
    HANDLE result = nullptr;
    check(DuplicateHandle(GetCurrentProcess(), source, GetCurrentProcess(), &result,
        0, TRUE, DUPLICATE_SAME_ACCESS));
    return result;
}

constexpr DWORD root_creation_flags(bool detachedRoot) {
    return EXTENDED_STARTUPINFO_PRESENT | CREATE_SUSPENDED |
        (detachedRoot ? DETACHED_PROCESS : CREATE_NO_WINDOW);
}
static_assert(root_creation_flags(false) == 0x08080004);
static_assert(root_creation_flags(true) == 0x0008000C);

int owner_main(int argc, wchar_t** argv) {
    output = GetStdHandle(STD_OUTPUT_HANDLE);
    const auto ownerOption = argc >= 5 ? std::wstring_view(argv[3]) : std::wstring_view{};
    const bool diagnoseMembers = ownerOption == L"--job-members-diagnostic";
    const bool detachedRoot = diagnoseMembers || ownerOption == L"--synthetic-root-console=detached-v1";
    const int firstArgument = detachedRoot ? 5 : 4;
    if (argc < 5 || !std::wstring_view(argv[1]).starts_with(L"--nonce=") ||
        !std::wstring_view(argv[2]).starts_with(L"--executable=") ||
        std::wstring_view(argv[firstArgument - 1]) != L"--") fail(ERROR_INVALID_PARAMETER);
    if (detachedRoot && (argc != 8 || std::wstring_view(argv[5]) != L"--role=root" ||
        !std::wstring_view(argv[6]).starts_with(L"--nonce=") ||
        !run_job::valid_nonce(std::wstring_view(argv[6]).substr(8)) ||
        std::wstring_view(argv[7]) != L"--remote-debugging-pipe")) fail(ERROR_INVALID_PARAMETER);
    const auto nonceValue = std::wstring_view(argv[1]).substr(8);
    if (!run_job::valid_nonce(nonceValue)) fail(ERROR_INVALID_PARAMETER);
    for (std::size_t i = 0; i < nonceValue.size(); ++i) nonce[i] = static_cast<char>(nonceValue[i]);
    const auto executable = std::wstring_view(argv[2]).substr(13);
    if (!run_job::absolute_executable(executable)) fail(ERROR_INVALID_PARAMETER);
    bool hasPipe = false;
    for (int i = firstArgument; i < argc; ++i) {
        const std::wstring_view argument(argv[i]);
        if (argument == L"--remote-debugging-pipe") hasPipe = true;
        if (argument == L"--" || run_job::is_switch(argument, L"remote-debugging-io-pipes") ||
            run_job::is_switch(argument, L"synthetic-root-console") ||
            (run_job::is_switch(argument, L"remote-debugging-pipe") && argument != L"--remote-debugging-pipe"))
            fail(ERROR_INVALID_PARAMETER);
    }
    if (!hasPipe) fail(ERROR_INVALID_PARAMETER);

    mailbox.input = GetStdHandle(STD_INPUT_HANDLE);
    mailbox.event = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    if (!mailbox.input || mailbox.input == INVALID_HANDLE_VALUE || !mailbox.event) fail(ERROR_INVALID_HANDLE);
    HANDLE reader = CreateThread(nullptr, 0, read_control, &mailbox, 0, nullptr);
    if (!reader) fail(GetLastError());
    check(CloseHandle(reader));

    job = CreateJobObjectW(nullptr, nullptr);
    if (!job) fail(GetLastError());
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    check(SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits)));

    HANDLE cdpRead = inherited_copy(reinterpret_cast<HANDLE>(_get_osfhandle(3)));
    HANDLE cdpWrite = inherited_copy(reinterpret_cast<HANDLE>(_get_osfhandle(4)));
    SECURITY_ATTRIBUTES security{sizeof(security), nullptr, TRUE};
    HANDLE nullInput = CreateFileW(L"NUL", GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE,
        &security, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    HANDLE nullOutput = CreateFileW(L"NUL", GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE,
        &security, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (nullInput == INVALID_HANDLE_VALUE || nullOutput == INVALID_HANDLE_VALUE) fail(GetLastError());
    const auto readValue = reinterpret_cast<std::uintptr_t>(cdpRead);
    const auto writeValue = reinterpret_cast<std::uintptr_t>(cdpWrite);
    if (readValue > UINT32_MAX || writeValue > UINT32_MAX) fail(ERROR_INVALID_HANDLE);
    std::wstring commandLine = run_job::quote(executable);
    for (int i = firstArgument; i < argc; ++i) commandLine += L" " + run_job::quote(argv[i]);
    commandLine += L" --remote-debugging-io-pipes=" + std::to_wstring(readValue) + L"," + std::to_wstring(writeValue);
    if (commandLine.size() >= 32767) fail(ERROR_BUFFER_OVERFLOW);

    SIZE_T attributeBytes = 0;
    InitializeProcThreadAttributeList(nullptr, 2, 0, &attributeBytes);
    if (!attributeBytes) fail(GetLastError());
    std::vector<unsigned char> attributes(attributeBytes);
    STARTUPINFOEXW startup{};
    startup.StartupInfo.cb = sizeof(startup);
    startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    startup.StartupInfo.hStdInput = nullInput;
    startup.StartupInfo.hStdOutput = nullOutput;
    startup.StartupInfo.hStdError = nullOutput;
    startup.lpAttributeList = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(attributes.data());
    check(InitializeProcThreadAttributeList(startup.lpAttributeList, 2, 0, &attributeBytes));
    HANDLE inherited[] = {cdpRead, cdpWrite, nullInput, nullOutput};
    check(UpdateProcThreadAttribute(startup.lpAttributeList, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
        inherited, sizeof(inherited), nullptr, nullptr));
    check(UpdateProcThreadAttribute(startup.lpAttributeList, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST,
        &job, sizeof(job), nullptr, nullptr));
    PROCESS_INFORMATION process{};
    const BOOL launched = CreateProcessW(executable.data(), commandLine.data(), nullptr, nullptr,
        TRUE, root_creation_flags(detachedRoot),
        nullptr, nullptr, &startup.StartupInfo, &process);
    const DWORD launchError = launched ? ERROR_SUCCESS : GetLastError();
    // The owner must not keep a CDP endpoint alive after the child inherits it.
    const BOOL readClosed = CloseHandle(cdpRead);
    const BOOL writeClosed = CloseHandle(cdpWrite);
    const int originalReadClosed = _close(3);
    const int originalWriteClosed = _close(4);
    DeleteProcThreadAttributeList(startup.lpAttributeList);
    const BOOL nullInputClosed = CloseHandle(nullInput);
    const BOOL nullOutputClosed = CloseHandle(nullOutput);
    if (!launched) fail(launchError);
    root = process.hProcess;
    rootPid = process.dwProcessId;
    if (!readClosed || !writeClosed || originalReadClosed || originalWriteClosed || !nullInputClosed || !nullOutputClosed)
        fail(ERROR_INVALID_HANDLE);
    created = creation_time(root);
    BOOL member = FALSE;
    check(IsProcessInJob(root, job, &member));
    if (!member || !rootPid || !created) fail(ERROR_INVALID_DATA);
    const auto initial = observe();
    if (!initial.active || initial.rootExited) fail(ERROR_INVALID_DATA);
    if (ResumeThread(process.hThread) != 1) fail(ERROR_INVALID_DATA);
    check(CloseHandle(process.hThread));
    emit("ready", initial, false);

    run_job::State state;
    for (;;) {
        if (WaitForSingleObject(mailbox.event, INFINITE) != WAIT_OBJECT_0) fail(ERROR_INVALID_DATA);
        if (mailbox.status.load(std::memory_order_acquire) != 2) fail(ERROR_INVALID_DATA);
        const auto command = mailbox.command;
        mailbox.status.store(0, std::memory_order_release);
        auto observation = observe();
        if (!state.accept(command, observation.rootExited, observation.active, observation.total)) fail(ERROR_INVALID_DATA);
        sequence = command.seq;
        if (command.kind == 'A') {
            check(TerminateJobObject(job, 1));
            observation = observe();
        }
        if (state.closed) {
            check(CloseHandle(job));
            job = nullptr;
            emit("closed", observation, state.aborted);
            ExitProcess(0);
        }
        emit("state", observation, state.aborted);
        if (run_job::should_sample_members(diagnoseMembers, command, observation)) sample_job_members();
    }
}
}

int wmain(int argc, wchar_t** argv) {
    try { return owner_main(argc, argv); }
    catch (...) { fail(ERROR_NOT_ENOUGH_MEMORY); }
}

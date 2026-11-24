#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#define _WIN32_WINNT 0x0A00
#include <windows.h>
#include <algorithm>
#include <array>
#include <atomic>
#include <cstdio>
#include <deque>
#include <mutex>
#include <string>
#include <vector>
#include "run-job-child.h"
#include "../../../scripts/extension-e2e/run-job-owner.h"

namespace {
using run_job_fixture::invalid;
using run_job_fixture::number;
std::string nonce;
std::wstring ownImage;
std::string ascii(std::wstring_view value) {
    std::string result;
    for (const wchar_t ch : value) { if (ch > 127) throw "argument"; result += static_cast<char>(ch); }
    return result;
}
std::string timestamp(HANDLE process) {
    FILETIME creation{}, exit{}, kernel{}, user{};
    if (!GetProcessTimes(process, &creation, &exit, &kernel, &user)) throw "creation";
    const auto value = (static_cast<unsigned long long>(creation.dwHighDateTime) << 32) | creation.dwLowDateTime;
    if (!value) throw "creation";
    char text[17]{};
    if (std::snprintf(text, sizeof(text), "%016llx", value) != 16) throw "creation";
    return text;
}
bool alive(HANDLE process) {
    const DWORD wait = WaitForSingleObject(process, 0);
    if (wait != WAIT_TIMEOUT && wait != WAIT_OBJECT_0) throw "wait";
    return wait == WAIT_TIMEOUT;
}
void write(HANDLE output, const std::string& line) {
    DWORD written = 0;
    if (line.size() > 8192 || !WriteFile(output, line.data(), static_cast<DWORD>(line.size()), &written, nullptr) || written != line.size()) throw "write";
}
std::vector<std::string> split(const std::string& line) {
    std::vector<std::string> parts;
    std::size_t start = 0;
    for (;;) {
        const auto end = line.find('\t', start);
        parts.push_back(line.substr(start, end == std::string::npos ? end : end - start));
        if (parts.size() > 6) throw "protocol";
        if (end == std::string::npos) return parts;
        start = end + 1;
    }
}
HANDLE handle(std::string_view value) {
    const auto parsed = number(value, UINT32_MAX);
    if (parsed == invalid || !parsed) throw "handle";
    const auto result = reinterpret_cast<HANDLE>(static_cast<std::uintptr_t>(parsed));
    DWORD flags = 0;
    if (!GetHandleInformation(result, &flags)) throw "handle";
    return result;
}
std::string identity(const char* role) {
    return std::string(role) + "\t" + std::to_string(GetCurrentProcessId()) + "\t" + timestamp(GetCurrentProcess()) + "\t" + nonce + "\n";
}
[[noreturn]] void hold() { for (;;) Sleep(INFINITE); }

void child(HANDLE output) {
    write(output, identity("CHILD"));
    // The inherited CDP writer is intentionally live until the owning Job kills us.
    hold();
}
void spawn_child(HANDLE output) {
    DWORD flags = 0;
    if (!GetHandleInformation(output, &flags) || !SetHandleInformation(output, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT)) throw "child-inherit";
    SIZE_T size = 0;
    InitializeProcThreadAttributeList(nullptr, 1, 0, &size);
    if (!size) throw "child-attributes";
    std::vector<unsigned char> storage(size);
    STARTUPINFOEXW startup{};
    startup.StartupInfo.cb = sizeof(startup);
    startup.lpAttributeList = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(storage.data());
    if (!InitializeProcThreadAttributeList(startup.lpAttributeList, 1, 0, &size)) throw "child-attributes";
    if (!UpdateProcThreadAttribute(startup.lpAttributeList, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST, &output, sizeof(output), nullptr, nullptr)) {
        DeleteProcThreadAttributeList(startup.lpAttributeList); throw "child-attributes";
    }
    const auto value = reinterpret_cast<std::uintptr_t>(output);
    if (value > UINT32_MAX) throw "child-handle";
    std::wstring command = run_job::quote(ownImage) + L" --role=child --nonce=" + std::wstring(nonce.begin(), nonce.end()) + L" --write=" + std::to_wstring(value);
    PROCESS_INFORMATION process{};
    const BOOL launched = CreateProcessW(ownImage.c_str(), command.data(), nullptr, nullptr, TRUE,
        EXTENDED_STARTUPINFO_PRESENT | DETACHED_PROCESS, nullptr, nullptr, &startup.StartupInfo, &process);
    DeleteProcThreadAttributeList(startup.lpAttributeList);
    const BOOL restored = SetHandleInformation(output, HANDLE_FLAG_INHERIT, flags & HANDLE_FLAG_INHERIT);
    if (!launched) throw "child-create";
    const BOOL threadClosed = CloseHandle(process.hThread), processClosed = CloseHandle(process.hProcess);
    if (!restored || !threadClosed || !processClosed) throw "child-close";
}
int root(HANDLE input, HANDLE output) {
    bool pinged = false, attempted = false;
    std::string line;
    for (;;) {
        char ch = 0; DWORD count = 0;
        // Controller death must not be simulated by a fixture's own EOF exit.
        if (!ReadFile(input, &ch, 1, &count, nullptr) || !count) hold();
        if (ch != '\n') { if (line.size() == 160) throw "root-bound"; line += ch; continue; }
        const auto fields = split(line); line.clear();
        if (fields.size() != 2 || fields[1] != nonce) throw "root-command";
        if (fields[0] == "PING" && !pinged) { pinged = true; write(output, identity("ROOT")); }
        else if (fields[0] == "CHILD" && pinged && !attempted) { attempted = true; spawn_child(output); }
        else if (fields[0] == "EXIT" && pinged) return 0;
        else throw "root-command";
    }
}

struct Output {
    HANDLE pipe = nullptr, event = nullptr, thread = nullptr;
    std::mutex mutex;
    std::deque<std::string> queue;
    std::atomic<bool> failed{false}, busy{false};
    std::size_t total = 0;
};
// Process lifetime: a blocked stdout writer cannot outlive this storage.
Output output;
DWORD WINAPI output_thread(void*) {
    for (;;) {
        if (WaitForSingleObject(output.event, INFINITE) != WAIT_OBJECT_0) { output.failed = true; return 1; }
        for (;;) {
            std::string next;
            {
                std::lock_guard lock(output.mutex);
                if (output.queue.empty()) { output.busy = false; break; }
                output.busy = true; next = std::move(output.queue.front()); output.queue.pop_front();
            }
            try { write(output.pipe, next); } catch (...) { output.failed = true; return 1; }
        }
    }
}
void emit(const std::string& value) {
    const std::string line = nonce + "\tW\t" + value + "\n";
    {
        std::lock_guard lock(output.mutex);
        if (line.size() > 8192 || output.total + line.size() > 32768 || output.queue.size() >= 32) throw "output-bound";
        output.total += line.size(); output.queue.push_back(line);
    }
    if (!SetEvent(output.event)) throw "output-event";
}
bool output_drained() {
    std::lock_guard lock(output.mutex);
    return output.queue.empty() && !output.busy && !output.failed;
}
std::wstring image_from_hex(const std::string& text) {
    if (text.empty() || text.size() % 4 || text.size() > 4096) throw "image";
    std::wstring result;
    for (std::size_t index = 0; index < text.size(); index += 4) {
        unsigned value = 0;
        for (std::size_t j = 0; j < 4; ++j) {
            const char ch = text[index + j];
            if (!((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f'))) throw "image";
            value = value * 16 + static_cast<unsigned>(ch <= '9' ? ch - '0' : ch - 'a' + 10);
        }
        if (!value) throw "image";
        result += static_cast<wchar_t>(value);
    }
    if (!run_job::absolute_executable(result)) throw "image";
    return result;
}
struct Target {
    const char* role;
    HANDLE process = nullptr;
    DWORD pid = 0;
    std::string created{};
    run_job_fixture::Identity state{};
};
std::array<Target, 4> targets{{{"helper"}, {"root"}, {"child"}, {"controller"}}};
Target& target(const std::string& role) {
    for (auto& item : targets) if (role == item.role) return item;
    throw "role";
}
void bind(const std::vector<std::string>& fields, bool controllerCase) {
    if (fields.size() != 5) throw "bind";
    auto& item = target(fields[1]);
    const bool provisional = fields[1] == "controller";
    if (item.state.bound || (provisional && !controllerCase) ||
        (provisional ? fields[3] != "-" : !run_job_fixture::created(fields[3]))) throw "bind";
    const auto pid = number(fields[2], UINT32_MAX);
    if (!pid || pid == invalid || pid == GetCurrentProcessId()) throw "pid";
    for (const auto& other : targets) if (other.process && other.pid == pid) throw "duplicate-pid";
    const auto image = image_from_hex(fields[4]);
    // Open exactly once; a failed identity is never replaced by reopening its PID.
    HANDLE process = OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE, FALSE, static_cast<DWORD>(pid));
    if (!process) throw "open";
    try {
        wchar_t name[32768]{}; DWORD length = static_cast<DWORD>(std::size(name));
        const auto creation = timestamp(process);
        if (!QueryFullProcessImageNameW(process, 0, name, &length) || _wcsicmp(name, image.c_str()) ||
            (!provisional && creation != fields[3]) || !alive(process)) throw "identity";
        if (!item.state.bind(provisional)) throw "bind";
        item.process = process; item.pid = static_cast<DWORD>(pid); item.created = creation;
    } catch (...) { CloseHandle(process); throw; }
    emit("B\t" + fields[1] + "\t" + item.created);
}
bool all_exited() {
    for (const auto& item : targets) if (item.process && alive(item.process)) return false;
    return true;
}
bool formed(const std::string& name) {
    for (const auto& item : targets) {
        const bool required = (std::string(item.role) != "child" && std::string(item.role) != "controller") ||
            (std::string(item.role) == "child" && name != "pipe-exit") ||
            (std::string(item.role) == "controller" && name == "controller-death");
        if (required != item.state.confirmed) return false;
        if (required && alive(item.process) != !(name == "detached-abort" && std::string(item.role) == "root")) return false;
    }
    return true;
}
std::string observation() {
    std::string value = "CHECK";
    for (const auto& item : targets) if (item.process) value += "\t" + std::string(item.role) + ":" + (alive(item.process) ? "alive" : "dead");
    return value;
}
bool cleanup(std::uint64_t deadline) {
    bool confirmed = true;
    for (auto& item : targets) {
        if (!item.process) continue;
        try {
            if (GetTickCount64() >= deadline) { confirmed = false; continue; }
            if (alive(item.process)) {
                if (!item.state.cleanup(true, true) || !run_job_fixture::timely(deadline, GetTickCount64,
                    [&] { return TerminateProcess(item.process, 92) != FALSE; })) confirmed = false;
            }
        } catch (...) { confirmed = false; }
    }
    while (GetTickCount64() < deadline) {
        try { if (run_job_fixture::timely(deadline, GetTickCount64, all_exited)) return confirmed; } catch (...) { return false; }
        Sleep(5);
    }
    return false;
}
int witness(const std::string& name) {
    output.pipe = GetStdHandle(STD_OUTPUT_HANDLE);
    output.event = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    if (!output.event) return 2;
    output.thread = CreateThread(nullptr, 0, output_thread, nullptr, 0, nullptr);
    if (!output.thread) return 2;
    const HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
    const auto born = GetTickCount64();
    run_job_fixture::Windows windows;
    bool go = false, ok = false, cleaned = false, cleanupConfirmed = false;
    std::string error = "", line;
    try {
        for (;;) {
            const auto now = GetTickCount64();
            if (output.failed) throw "output";
            if (go) {
                if (now >= windows.measurement) throw "measurement-deadline";
                if (run_job_fixture::timely(windows.measurement, GetTickCount64, all_exited)) { ok = true; break; }
            } else if (now >= (windows.formation ? windows.formation : born + 10000)) throw "formation-deadline";
            DWORD available = 0;
            if (!PeekNamedPipe(input, nullptr, 0, nullptr, &available, nullptr)) {
                if (!go) throw "input-eof";
            } else if (available) {
                char ch = 0; DWORD count = 0;
                if (!ReadFile(input, &ch, 1, &count, nullptr) || !count) throw "input-read";
                if (ch != '\n') { if (line.size() == 4608) throw "input-bound"; line += ch; continue; }
                const auto fields = split(line); line.clear();
                if (fields.size() == 1 && fields[0] == "STOP") throw "driver-stop";
                if (go) throw "command-after-go";
                if (fields.size() == 1 && fields[0] == "HELLO" && windows.hello(now)) emit("HELLO");
                else if (fields.size() == 3 && fields[0] == "LIMIT" && windows.limit(now, number(fields[1], 60000), number(fields[2], 10000))) emit("LIMIT");
                else if (fields[0] == "B" && windows.row && windows.armAt == invalid) bind(fields, name == "controller-death");
                else if (fields.size() == 3 && fields[0] == "C" && fields[1] == "controller" && windows.row && windows.armAt == invalid) {
                    auto& item = target("controller");
                    if (!item.process || item.created != fields[2] || !alive(item.process) || !item.state.confirm()) throw "confirmation";
                    emit("C\tcontroller\t" + item.created);
                } else if (fields.size() == 1 && fields[0] == "CHECK" && windows.row && windows.armAt == invalid) emit(observation());
                else if (fields.size() == 1 && fields[0] == "ARM" && formed(name) && windows.arm(GetTickCount64())) emit("ARM");
                else if (fields.size() == 2 && fields[0] == "GO" && windows.go(GetTickCount64(), number(fields[1], 35000), name.ends_with("-death") ? 15000 : 35000)) {
                    if (!run_job_fixture::timely(windows.measurement, GetTickCount64, [&] { return formed(name); })) throw "go-identity";
                    go = true;
                    if (name.ends_with("-death")) {
                        auto& victim = target(name == "helper-death" ? "helper" : "controller");
                        if (!victim.state.may_terminate()) throw "fault-authority";
                        victim.state.attempted = true;
                        if (!run_job_fixture::timely(windows.measurement, GetTickCount64,
                            [&] { return TerminateProcess(victim.process, 91) != FALSE; })) throw "fault-terminate";
                    }
                    emit("GO");
                } else throw "protocol";
            }
            Sleep(1);
        }
    } catch (const char* reason) { error = reason; } catch (...) { error = "exception"; }
    // The result above is immutable before any optional retained-handle cleanup.
    const auto rowDeadline = windows.row ? windows.row : born + 60000;
    std::string cutoff = "";
    for (const auto& item : targets) if (item.process) {
        std::string state = "unknown";
        try { state = alive(item.process) ? "alive" : "dead"; } catch (...) {}
        if (!cutoff.empty()) cutoff += ",";
        cutoff += "{\"role\":\"" + std::string(item.role) + "\",\"state\":\"" + state + "\"}";
    }
    if (!ok) {
        cleaned = true;
        cleanupConfirmed = cleanup((std::min)(GetTickCount64() + 10000, rowDeadline - 5000));
    }
    std::string exited = "", identities = "";
    try {
        for (const auto& item : targets) if (item.process) {
            if (!alive(item.process)) { if (!exited.empty()) exited += ","; exited += "\"" + std::string(item.role) + "\""; }
            if (!identities.empty()) identities += ",";
            identities += "{\"role\":\"" + std::string(item.role) + "\",\"pid\":" + std::to_string(item.pid) + ",\"created\":\"" + item.created + "\",\"confirmed\":" + (item.state.confirmed ? "true" : "false") + "}";
        }
        emit("RESULT\t{\"ok\":" + std::string(ok ? "true" : "false") + ",\"cleanup\":" + (cleaned ? "true" : "false") +
            ",\"cleanupConfirmed\":" + (cleanupConfirmed ? "true" : "false") + ",\"created\":" + (target("child").state.bound ? "1" : "0") +
            ",\"error\":\"" + error + "\",\"beforeCleanupStates\":[" + cutoff + "],\"exited\":[" + exited + "],\"identities\":[" + identities + "]}");
    } catch (...) { ok = false; }
    for (auto& item : targets) if (item.process && !CloseHandle(item.process)) ok = false;
    const auto outputDeadline = (std::min)(GetTickCount64() + 5000, rowDeadline);
    while (!output_drained() && !output.failed && GetTickCount64() < outputDeadline) Sleep(1);
    if (!output_drained()) ok = false;
    // ExitProcess ends an undrained writer; its failed exit cannot certify success.
    ExitProcess(ok ? 0 : 1);
}
}

int wmain(int argc, wchar_t** argv) {
    try {
        wchar_t image[32768]{};
        const DWORD length = GetModuleFileNameW(nullptr, image, static_cast<DWORD>(std::size(image)));
        if (!length || length >= std::size(image)) return 2;
        ownImage = image;
        if (argc < 4 || !std::wstring_view(argv[2]).starts_with(L"--nonce=")) return 2;
        const auto rawNonce = std::wstring_view(argv[2]).substr(8);
        if (!run_job::valid_nonce(rawNonce)) return 2;
        nonce = ascii(rawNonce);
        const std::wstring_view role(argv[1]);
        if (role == L"--role=witness" && argc == 4 && std::wstring_view(argv[3]).starts_with(L"--case=")) {
            const auto name = ascii(std::wstring_view(argv[3]).substr(7));
            if (name != "pipe-exit" && name != "detached-abort" && name != "helper-death" && name != "controller-death") return 2;
            return witness(name);
        }
        if (role == L"--role=child" && argc == 4 && std::wstring_view(argv[3]).starts_with(L"--write=")) {
            child(handle(ascii(std::wstring_view(argv[3]).substr(8)))); return 0;
        }
        if (role != L"--role=root" || argc != 5 || std::wstring_view(argv[3]) != L"--remote-debugging-pipe" ||
            !std::wstring_view(argv[4]).starts_with(L"--remote-debugging-io-pipes=")) return 2;
        const auto pipes = ascii(std::wstring_view(argv[4]).substr(28));
        const auto comma = pipes.find(',');
        if (comma == std::string::npos || pipes.find(',', comma + 1) != std::string::npos) return 2;
        return root(handle(pipes.substr(0, comma)), handle(pipes.substr(comma + 1)));
    } catch (...) { return 2; }
}

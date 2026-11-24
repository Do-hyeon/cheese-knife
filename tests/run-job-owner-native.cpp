// Compile-only: these assertions exercise the same parser/state/quoting used by the owner.
// They do not execute or certify any Win32 process, pipe, or Job behavior.
#include "../scripts/extension-e2e/run-job-owner.h"
using namespace run_job;
constexpr bool exit_during_accounting() {
    bool exited = false;
    const auto result = read_observation([&] { exited = true; return Observation{0, 1, false}; }, [&] { return exited; });
    return result.active == 0 && result.total == 1 && result.rootExited;
}
static_assert(exit_during_accounting());
static_assert(parse_command("Q 1").kind == 'Q');
static_assert(parse_command("A 4294967295").seq == 4294967295u);
static_assert(parse_command("C 2").kind == 'C');
static_assert(parse_command("Q 0").kind == 0);
static_assert(parse_command("Q 01").kind == 0);
static_assert(parse_command("Q 4294967296").kind == 0);
static_assert(parse_command("Q 1\r").kind == 0);
static_assert(parse_command("Q 1\n").kind == 0);
static_assert(parse_command(" Q 1").kind == 0);
static_assert(parse_command("X 1").kind == 0);
static_assert(parse_command("Q -1").kind == 0);
static_assert(parse_command("Q 1 extra").kind == 0);
static_assert(valid_nonce(L"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"));
static_assert(!valid_nonce(L"0123456789abcdeF0123456789abcdef0123456789abcdef0123456789abcdef"));
static_assert(!valid_nonce(L"abc"));
static_assert(absolute_executable(L"C:\\Program Files\\chrome.exe"));
static_assert(!absolute_executable(L"\\\\server\\share\\chrome.exe"));
static_assert(!absolute_executable(L"C:chrome.exe"));
static_assert(!absolute_executable(L"chrome.exe"));
static_assert(!absolute_executable(L"\\chrome.exe"));
static_assert(is_switch(L"--remote-debugging-io-pipes=1,2", L"remote-debugging-io-pipes"));
static_assert(is_switch(L"-remote-debugging-io-pipes=1,2", L"remote-debugging-io-pipes"));
static_assert(is_switch(L"/REMOTE-DEBUGGING-IO-PIPES=1,2", L"remote-debugging-io-pipes"));
static_assert(is_switch(L"--REMOTE-DEBUGGING-PIPE", L"remote-debugging-pipe"));
static_assert(!is_switch(L"--other=--remote-debugging-io-pipes", L"remote-debugging-io-pipes"));
static_assert(!is_switch(L"--remote-debugging-io-pipes-extra", L"remote-debugging-io-pipes"));
static_assert(quote(L"") == L"\"\"");
static_assert(quote(L"a b") == L"\"a b\"");
static_assert(quote(L"a\"b") == L"\"a\\\"b\"");
static_assert(quote(L"C:\\a b\\") == L"\"C:\\a b\\\\\"");
static_assert(quote(L"a\\\"b") == L"\"a\\\\\\\"b\"");
constexpr bool normal_close() {
    State s;
    return s.accept({'Q', 1}, false, 1, 1) &&
        !s.accept({'C', 2}, false, 0, 1) &&
        !s.accept({'C', 2}, true, 1, 1) &&
        !s.accept({'C', 2}, true, 0, 0) &&
        s.accept({'C', 2}, true, 0, 1) && s.closed &&
        !s.accept({'Q', 3}, true, 0, 1);
}
constexpr bool ordered_abort() {
    State s;
    return !s.accept({'Q', 2}, false, 1, 1) &&
        s.accept({'A', 1}, false, 1, 1) && s.aborted &&
        !s.accept({'A', 2}, false, 1, 1) &&
        !s.accept({'Q', 1}, false, 1, 1) &&
        s.accept({'Q', 2}, true, 0, 2) &&
        s.accept({'C', 3}, true, 0, 2);
}
static_assert(normal_close());
static_assert(ordered_abort());
static_assert(should_sample_members(true, {'Q', 1}, {2, 2, false}));
static_assert(!should_sample_members(false, {'Q', 1}, {2, 2, false}));
static_assert(!should_sample_members(true, {'Q', 2}, {2, 2, false}));
static_assert(!should_sample_members(true, {'A', 1}, {2, 2, false}));
static_assert(!should_sample_members(true, {'Q', 1}, {1, 2, false}));
static_assert(!should_sample_members(true, {'Q', 1}, {2, 3, false}));
static_assert(valid_member_pids(2, 2, 42, 43, 42));
static_assert(!valid_member_pids(3, 2, 42, 43, 42));
static_assert(!valid_member_pids(2, 1, 42, 43, 42));
static_assert(!valid_member_pids(2, 2, 42, 42, 42));
static_assert(!valid_member_pids(2, 2, 42, 0, 42));
static_assert(!valid_member_pids(2, 2, 42, UINT64_C(0x100000000), 42));
static_assert(!valid_member_pids(2, 2, 43, 44, 42));

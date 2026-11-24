// Compile-only assertions; no Win32 calls or executable entry point.
#include "fixtures/installed-extension/run-job-child.h"
using namespace run_job_fixture;
static_assert(number("42", 100) == 42);
static_assert(number("0", 100) == 0);
static_assert(number("01", 100) == invalid);
static_assert(number("101", 100) == invalid);
static_assert(number("-1", 100) == invalid);
static_assert(number("", 100) == invalid);
static_assert(created("0000000000000001"));
static_assert(!created("0000000000000000"));
static_assert(!created("000000000000000G"));
constexpr bool anchored_windows() {
    Windows w;
    return w.hello(1000) && !w.hello(1001) &&
        w.limit(2000, 58000, 8000) && w.row == 59000 && w.formation == 9000 &&
        w.arm(5000) && w.go(6000, 14000, 15000) && w.measurement == 19000 &&
        !w.go(6001, 14000, 15000);
}
static_assert(anchored_windows());
constexpr bool expiry_cannot_reset() {
    Windows w;
    return w.hello(100) && !w.limit(10100, 60000, 10000);
}
static_assert(expiry_cannot_reset());
constexpr bool late_go_is_not_fresh_time() {
    Windows w;
    return w.hello(100) && w.limit(200, 59000, 9000) && w.arm(300) &&
        !w.go(15300, 15000, 15000);
}
static_assert(late_go_is_not_fresh_time());
constexpr bool controller_confirmation_required() {
    Identity i;
    return i.bind(true) && !i.may_terminate() && i.confirm() &&
        i.may_terminate() && !i.confirm() && !i.bind(true);
}
static_assert(controller_confirmation_required());
constexpr bool cleanup_only_once_after_seal() {
    Identity i;
    return i.bind(false) && !i.cleanup(false, true) && i.cleanup(true, true) &&
        !i.cleanup(true, true);
}
static_assert(cleanup_only_once_after_seal());
constexpr bool late_observation_is_failure() {
    std::uint64_t now = 5;
    return !run_job_fixture::timely(10, [&] { return now; }, [&] { now = 10; return true; });
}
constexpr bool expired_operation_does_not_run() {
    bool ran = false;
    return !run_job_fixture::timely(10, [] { return 10u; }, [&] { ran = true; return true; }) && !ran;
}
static_assert(late_observation_is_failure());
static_assert(expired_operation_does_not_run());
constexpr bool formation_expired_after_arm() {
    Windows w;
    return w.hello(100) && w.limit(200, 59000, 9000) && w.arm(300) &&
        !w.go(9100, 15000, 15000);
}
static_assert(formation_expired_after_arm());

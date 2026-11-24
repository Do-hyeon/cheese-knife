#pragma once
#include <cstdint>
#include <limits>
#include <string_view>

namespace run_job_fixture {
constexpr std::uint64_t invalid = (std::numeric_limits<std::uint64_t>::max)();
constexpr std::uint64_t number(std::string_view text, std::uint64_t maximum) {
    if (text.empty() || (text.size() > 1 && text[0] == '0')) return invalid;
    std::uint64_t result = 0;
    for (const char ch : text) {
        if (ch < '0' || ch > '9') return invalid;
        const auto digit = static_cast<std::uint64_t>(ch - '0');
        if (digit > maximum || result > (maximum - digit) / 10) return invalid;
        result = result * 10 + digit;
    }
    return result;
}
constexpr bool created(std::string_view text) {
    if (text.size() != 16 || text == "0000000000000000") return false;
    for (const char ch : text) if (!((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f'))) return false;
    return true;
}
template<class Clock, class Operation>
constexpr bool timely(std::uint64_t deadline, Clock clock, Operation operation) {
    if (clock() >= deadline) return false;
    const bool observed = operation();
    return observed && clock() < deadline;
}
struct Windows {
    std::uint64_t helloAt = invalid, armAt = invalid, row = 0, formation = 0, measurement = 0;
    constexpr bool hello(std::uint64_t now) {
        if (helloAt != invalid) return false;
        helloAt = now; return true;
    }
    constexpr bool limit(std::uint64_t now, std::uint64_t rowRemaining, std::uint64_t formationRemaining) {
        if (helloAt == invalid || row || rowRemaining > 60000 || rowRemaining <= 15000 ||
            formationRemaining == 0 || formationRemaining > 10000 || formationRemaining > rowRemaining ||
            now >= helloAt + formationRemaining) return false;
        row = helloAt + rowRemaining; formation = helloAt + formationRemaining; return true;
    }
    constexpr bool arm(std::uint64_t now) {
        if (!row || armAt != invalid || now >= formation) return false;
        armAt = now; return true;
    }
    constexpr bool go(std::uint64_t now, std::uint64_t remaining, std::uint64_t maximum) {
        if (armAt == invalid || measurement || now >= formation || remaining == 0 || remaining > maximum ||
            armAt + remaining <= now || armAt + remaining > row - 15000) return false;
        measurement = armAt + remaining; return true;
    }
};
struct Identity {
    bool bound = false, confirmed = false, attempted = false;
    constexpr bool bind(bool provisional) {
        if (bound) return false;
        bound = true; confirmed = !provisional; return true;
    }
    constexpr bool confirm() {
        if (!bound || confirmed) return false;
        confirmed = true; return true;
    }
    constexpr bool may_terminate() const { return bound && confirmed && !attempted; }
    constexpr bool cleanup(bool sealed, bool alive) {
        if (!sealed || !alive || !may_terminate()) return false;
        attempted = true; return true;
    }
};
}

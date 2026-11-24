#pragma once
#include <cstdint>
#include <string>
#include <string_view>

namespace run_job {
struct Command { char kind = 0; std::uint32_t seq = 0; };
struct Observation { std::uint32_t active; std::uint32_t total; bool rootExited; };
constexpr bool should_sample_members(bool enabled, Command command, Observation observation) {
    return enabled && command.kind == 'Q' && command.seq == 1 &&
        observation.active == 2 && observation.total == 2;
}
constexpr bool valid_member_pids(std::uint32_t assigned, std::uint32_t listed,
    std::uint64_t first, std::uint64_t second, std::uint32_t rootPid) {
    return assigned == 2 && listed == 2 && first > 0 && first <= UINT32_MAX &&
        second > 0 && second <= UINT32_MAX && first != second &&
        (first == rootPid || second == rootPid);
}
template <typename Accounting, typename RootExited>
constexpr Observation read_observation(Accounting accounting, RootExited rootExited) {
    auto observation = accounting();
    // An empty accounting sample must precede the retained root exit sample.
    observation.rootExited = rootExited();
    return observation;
}
constexpr Command parse_command(std::string_view line) {
    if (line.size() < 3 || line.size() > 12 ||
        (line[0] != 'Q' && line[0] != 'A' && line[0] != 'C') ||
        line[1] != ' ' || line[2] < '1' || line[2] > '9') return {};
    std::uint32_t seq = 0;
    for (std::size_t i = 2; i < line.size(); ++i) {
        if (line[i] < '0' || line[i] > '9') return {};
        const auto digit = static_cast<std::uint32_t>(line[i] - '0');
        if (seq > (UINT32_MAX - digit) / 10) return {};
        seq = seq * 10 + digit;
    }
    return {line[0], seq};
}
constexpr bool valid_nonce(std::wstring_view nonce) {
    if (nonce.size() != 64) return false;
    for (const auto c : nonce) {
        if (!((c >= L'0' && c <= L'9') || (c >= L'a' && c <= L'f'))) return false;
    }
    return true;
}
constexpr bool absolute_executable(std::wstring_view path) {
    const auto slash = [](wchar_t c) { return c == L'\\' || c == L'/'; };
    if (path.size() >= 3 &&
        ((path[0] >= L'A' && path[0] <= L'Z') || (path[0] >= L'a' && path[0] <= L'z')) &&
        path[1] == L':' && slash(path[2])) return true;
    return false;
}
constexpr bool is_switch(std::wstring_view argument, std::wstring_view name) {
    if (argument.starts_with(L"--")) argument.remove_prefix(2);
    else if (argument.starts_with(L"-") || argument.starts_with(L"/")) argument.remove_prefix(1);
    else return false;
    argument = argument.substr(0, argument.find(L'='));
    if (argument.size() != name.size()) return false;
    for (std::size_t i = 0; i < name.size(); ++i) {
        const auto c = argument[i];
        if ((c >= L'A' && c <= L'Z' ? c + (L'a' - L'A') : c) != name[i]) return false;
    }
    return true;
}
constexpr std::wstring quote(std::wstring_view argument) {
    std::wstring result = L"\"";
    std::size_t slashes = 0;
    for (const auto c : argument) {
        if (c == L'\\') { ++slashes; continue; }
        result.append(slashes * (c == L'\"' ? 2 : 1), L'\\');
        slashes = 0;
        if (c == L'\"') result += L'\\';
        result += c;
    }
    result.append(slashes * 2, L'\\');
    result += L'\"';
    return result;
}
struct State {
    std::uint32_t last = 0;
    bool aborted = false;
    bool closed = false;
    constexpr bool accept(Command command, bool rootExited, std::uint32_t active, std::uint32_t total) {
        if (closed || last == UINT32_MAX || command.seq != last + 1 || total == 0 ||
            active > total || (command.kind != 'Q' && command.kind != 'A' && command.kind != 'C')) return false;
        if (command.kind == 'A' && aborted) return false;
        if (command.kind == 'C' && (!rootExited || active != 0)) return false;
        last = command.seq;
        if (command.kind == 'A') aborted = true;
        if (command.kind == 'C') closed = true;
        return true;
    }
};
}

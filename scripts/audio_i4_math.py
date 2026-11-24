"""E1 primitive intervals only. No product, actual output or native assumptions."""
import time
import gmpy2 as g

SCALE = 1 << 256
MINIMUM, MAXIMUM = -(1 << 511), (1 << 511) - 1


class Context:
    def __init__(self, remaining_ms=120000):
        if not isinstance(remaining_ms, (int, float)) or not 0 < remaining_ms <= 120000:
            raise ValueError('i4-budget')
        self.deadline = time.monotonic() + remaining_ms / 1000

    def check(self):
        if time.monotonic() >= self.deadline:
            raise ValueError('i4-case-timeout')


def integer(value):
    if not isinstance(value, str) or not value or len(value) > 9865:
        raise ValueError('i4-integer')
    digits = value[1:] if value.startswith('-') else value
    if not digits.isascii() or not digits.isdecimal() or (len(digits) > 1 and digits.startswith('0')) or value == '-0':
        raise ValueError('i4-integer')
    # Manual length check precedes the bounded child-local decimal conversion.
    import sys
    sys.set_int_max_str_digits(9865)
    n = int(value)
    if n.bit_length() > 32768:
        raise ValueError('i4-integer-cap')
    return n


def checked(lo, hi):
    if type(lo) is not int or type(hi) is not int or not MINIMUM <= lo <= hi <= MAXIMUM:
        raise ValueError('i4-grid-overflow')
    return lo, hi


def rational(n, d=1):
    if type(n) is not int or type(d) is not int or d <= 0 or max(n.bit_length(), d.bit_length()) > 32768:
        raise ValueError('i4-rational')
    return checked(n * SCALE // d, -((-n * SCALE) // d))


def directed(ctx, rounding, operation):
    ctx.check()
    with g.context(precision=320, round=rounding, emax=32768, emin=-32768,
                   trap_overflow=True, trap_underflow=True, trap_invalid=True, trap_divzero=True):
        value = operation()
        if not g.is_finite(value):
            raise ValueError('i4-nonfinite')
        return value


def endpoints(x, ctx):
    lo, hi = checked(*x)
    return (directed(ctx, g.RoundDown, lambda: g.mpfr(g.mpq(lo, SCALE))),
            directed(ctx, g.RoundUp, lambda: g.mpfr(g.mpq(hi, SCALE))))


def grid(lo, hi, ctx):
    low = directed(ctx, g.RoundDown, lambda: lo * SCALE)
    high = directed(ctx, g.RoundUp, lambda: hi * SCALE)
    low_n, low_d = low.as_integer_ratio()
    high_n, high_d = high.as_integer_ratio()
    return checked(int(low_n // low_d), int(-((-high_n) // high_d)))


def constant_pi(ctx):
    return grid(directed(ctx, g.RoundDown, g.const_pi), directed(ctx, g.RoundUp, g.const_pi), ctx)


def interval_binary(op, a, b, ctx):
    x, y = endpoints(a, ctx), endpoints(b, ctx)
    if op == 'div' and b[0] <= 0 <= b[1]:
        raise ValueError('i4-divisor-zero')
    functions = {'add': g.add, 'sub': g.sub, 'mul': g.mul, 'div': g.div}
    if op not in functions:
        raise ValueError('i4-operation')
    fn = functions[op]
    lows = [directed(ctx, g.RoundDown, lambda: fn(u, v)) for u in x for v in y]
    highs = [directed(ctx, g.RoundUp, lambda: fn(u, v)) for u in x for v in y]
    return grid(min(lows), max(highs), ctx)


def interval_unary(op, x, ctx):
    lo, hi = endpoints(x, ctx)
    if op == 'log' and x[0] <= 0 or op == 'sqrt' and x[0] < 0:
        raise ValueError('i4-domain')
    functions = {'exp': g.exp, 'log': g.log, 'sqrt': g.sqrt, 'sin': g.sin, 'cos': g.cos}
    if op not in functions:
        raise ValueError('i4-operation')
    fn = functions[op]
    if op not in ('sin', 'cos'):
        return grid(directed(ctx, g.RoundDown, lambda: fn(lo)), directed(ctx, g.RoundUp, lambda: fn(hi)), ctx)
    lows = [directed(ctx, g.RoundDown, lambda: fn(v)) for v in (lo, hi)]
    highs = [directed(ctx, g.RoundUp, lambda: fn(v)) for v in (lo, hi)]
    p = (directed(ctx, g.RoundDown, g.const_pi), directed(ctx, g.RoundUp, g.const_pi))
    # Exact rational critical-point enclosure includes uncertain pi boundaries.
    quotients = [g.mpq(v) / g.mpq(pi) for v in (lo, hi) for pi in p]
    offset = g.mpq(1, 2) if op == 'sin' else g.mpq(0)
    lower, upper = min(quotients) - offset, max(quotients) - offset
    first = int(-((-lower.numerator) // lower.denominator))
    last = int(upper.numerator // upper.denominator)
    low, high = min(lows), max(highs)
    if first <= last:
        if first % 2 == 0 or first < last:
            high = g.mpfr(1)
        if first % 2 == 1 or first < last:
            low = g.mpfr(-1)
    return grid(low, high, ctx)


def encode_interval(x):
    lo, hi = checked(*x)
    return lo.to_bytes(64, 'little', signed=True) + hi.to_bytes(64, 'little', signed=True)

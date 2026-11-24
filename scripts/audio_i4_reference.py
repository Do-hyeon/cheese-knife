"""Independent E1 mathematics. Never consumes actual program/control or native bounds."""
import hashlib
import importlib.util
import json
import math
import pathlib
import sys
import struct
from fractions import Fraction

FILE = pathlib.Path(__file__).resolve().with_name('audio_i4_math.py')
SPEC = importlib.util.spec_from_file_location('i4_fixed_math', FILE)
MATH = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MATH)

FREQUENCIES = (63, 125, 250, 500, 1000, 2000, 4000, 8000)
S = MATH.SCALE
CS = 1 << 320
ZERO, ONE = (0, 0), (S, S)


def exact(value):
    f = Fraction(value)
    return MATH.rational(f.numerator, f.denominator)


def add(a, b):
    return MATH.checked(a[0] + b[0], a[1] + b[1])


def neg(a):
    return MATH.checked(-a[1], -a[0])


def sub(a, b):
    return add(a, neg(b))


def mul(a, b):
    values = [u * v for u in a for v in b]
    return MATH.checked(min(values) // S, -((-max(values)) // S))


def div(a, b):
    if b[0] <= 0 <= b[1]:
        raise ValueError('i4-divisor-zero')
    values = [Fraction(u * S, v) for u in a for v in b]
    low, high = min(values), max(values)
    return MATH.checked(low.numerator // low.denominator, -((-high.numerator) // high.denominator))


def norm_up(values, scale=S):
    # Integer sqrt is an exact upward enclosure, not a host-float norm.
    n = sum(v * v for v in values)
    root = math.isqrt(n)
    return root + (root * root != n)


def midpoint(x):
    return (x[0] + x[1]) // 2


def magnitude(x):
    return max(abs(x[0]), abs(x[1]))


def power10(x, ctx):
    return MATH.interval_unary('exp', mul(x, MATH.interval_unary('log', exact(10), ctx)), ctx)


def affine(a, b, frame, start, length):
    if frame <= start:
        return a
    if frame >= start + length:
        return b
    return add(a, mul(sub(b, a), exact(Fraction(frame - start, length))))


def validate_command(command, previous_frame=-1, previous_seq=0, frames=256000):
    fields(command, ('frame', 'seq', 'wanted', 'gain', 'eq', 'sourceEpoch'))
    a, seq, eq, gain = command['frame'], command['seq'], command['eq'], command['gain']
    if type(a) is not int or not 0 <= a < frames or a < previous_frame or type(seq) is not int or not previous_seq < seq <= 9007199254740991 or type(command['wanted']) is not bool or type(command['sourceEpoch']) is not int or command['sourceEpoch'] != 1:
        raise ValueError('i4-command-order')
    if type(gain) not in (int, float) or not math.isfinite(gain) or not 0 <= gain <= 2 or type(eq) is not list or len(eq) != 8 or any(type(v) not in (int, float) or not math.isfinite(v) or not -6 <= v <= 6 for v in eq):
        raise ValueError('i4-command-domain')


class Control:
    """Source-time functions and at most one joint prefix; no captured controls."""
    def __init__(self, fs, initial, ctx):
        if fs not in (44100, 48000, 96000) or initial not in ('raw', 'silent-hold'):
            raise ValueError('i4-control-domain')
        self.fs, self.ctx = fs, ctx
        f32 = lambda x: struct.unpack('<f', struct.pack('<f', x))[0]
        self.delay = min(math.floor(f32(f32(.006) * f32(fs))), 1023)
        self.N, self.M = Fraction(fs, 50), Fraction(fs, 100)
        self.wanted, self.seq, self.done, self.accepted_frame = initial == 'silent-hold', 0, 0, -1
        self.eq_plan = ([ZERO] * 8, [ZERO] * 8, 0, 0)
        self.gain_plans = [(exact(0 if self.wanted else 1), exact(0 if self.wanted else 1), 0, 0)]
        self.q_plan = (exact(1 if self.wanted else 0), exact(1 if self.wanted else 0), 0, 0)
        self.joint = None
        self.ring = [exact(0 if self.wanted else 1)] * (self.delay + 1)
        pi = MATH.constant_pi(ctx)
        self.beta = []
        for f in FREQUENCIES:
            w = mul(pi, exact(Fraction(2 * f, fs)))
            self.beta.append(div(MATH.interval_unary('sin', w, ctx), mul(exact(2), sub(ONE, MATH.interval_unary('cos', w, ctx)))))
        self.log10 = MATH.interval_unary('log', exact(10), ctx)

    def joint_tuple(self, record, frame):
        a, end, until, eq, gain = record
        x, N, Q = Fraction(frame - a), self.N, 128
        if x <= 0:
            return eq, gain
        if x >= N:
            return [ZERO] * 8, ONE
        z = min(Fraction(1), min(x, N - x) / Q)
        R = 10 * z ** 3 - 15 * z ** 4 + 6 * z ** 5
        F = Fraction(5, 2) * z ** 4 - 3 * z ** 5 + z ** 6
        p = Q * F / (N - Q) if x < Q else 1 - Q * F / (N - Q) if x > N - Q else (x - Fraction(Q, 2)) / (N - Q)
        dp = R / (N - Q)
        gains = [mul(g, exact(1 - p)) for g in eq]
        nu = ZERO
        for i, g in enumerate(eq):
            if g[1] < 0:
                A = MATH.interval_unary('exp', mul(div(gains[i], exact(40)), self.log10), self.ctx)
                nu = add(nu, mul(mul(mul(mul(self.beta[i], div(self.log10, exact(40))), add(A, div(ONE, A))), neg(g)), exact(dp)))
            elif g[0] < 0:
                raise ValueError('i4-ambiguous-eq-sign')
        if gain[0] > S:
            base = MATH.interval_unary('exp', mul(exact(1 - p), MATH.interval_unary('log', gain, self.ctx)), self.ctx)
        elif gain[1] <= S:
            base = add(gain, mul(sub(ONE, gain), exact(p)))
        else:
            raise ValueError('i4-ambiguous-gain-branch')
        return gains, div(base, add(ONE, nu))

    def tuple(self, frame):
        self.ctx.check()
        q = affine(*self.q_plan[:2], frame, *self.q_plan[2:])
        if self.joint and self.joint[0] <= frame < min(self.joint[1:3]):
            eq, gain = self.joint_tuple(self.joint, frame)
            return eq, gain, q
        a, b, start, length = self.eq_plan
        eq = [affine(u, v, frame, start, length) for u, v in zip(a, b)]
        plan = self.gain_plans[0]
        for candidate in self.gain_plans[1:]:
            if candidate[2] <= frame:
                plan = candidate
        return eq, affine(*plan[:2], frame, *plan[2:]), q

    def accept(self, command):
        validate_command(command, self.accepted_frame, self.seq)
        a, seq, on = command['frame'], command['seq'], command['wanted']
        gain, eq = command['gain'], command['eq']
        changed = on != self.wanted
        self.seq, self.accepted_frame = seq, a
        if not on and not changed:
            return
        current_eq, current_gain, q = self.tuple(a)
        start = a + (self.M if changed and on else 0)
        first_eq, first_gain, _ = self.tuple(start) if changed and on else (current_eq, current_gain, q)
        if changed:
            self.q_plan = (q, ONE if on else ZERO, a if on else a + self.N + self.delay, self.M)
        previous_joint = self.joint
        self.eq_plan = (first_eq, [exact(v) for v in eq] if on else [ZERO] * 8, start, self.N)
        self.gain_plans = [p for p in self.gain_plans if p[2] < start]
        if not self.gain_plans:
            self.gain_plans = [(first_gain, first_gain, 0, 0)]
        duration = self.N if changed else self.M
        self.gain_plans.append((first_gain, exact(gain) if on else ONE, start, duration))
        if changed and not on:
            self.joint = (a, a + self.N, a + self.N, current_eq, current_gain)
        elif changed and on and previous_joint and a < min(previous_joint[1:3]):
            self.joint = (*previous_joint[:2], min(previous_joint[2], start), *previous_joint[3:])
        else:
            self.joint = None
        self.wanted = on
        self.done = math.ceil(max(self.q_plan[2] + self.q_plan[3], start + self.N, start + duration + self.delay))

    def frame(self, n):
        eq, gain, q = self.tuple(n)
        self.ring[n % len(self.ring)] = gain
        delayed = self.ring[(n - self.delay) % len(self.ring)]
        return neg(q), q, delayed, ONE, exact(1 if self.wanted and self.gain_plans[-1][1] == ZERO else 0)


class Stage:
    """Real ideal matrix with 320-bit centers and a Euclidean error ball."""
    def __init__(self, fs, frequency, ctx, native_bounds=None):
        if native_bounds is not None:
            raise ValueError('i4-native-bounds-not-admitted')
        self.fs, self.frequency, self.ctx = fs, frequency, ctx
        self.center, self.radius, self.cache = [0, 0], 0, None
        w = mul(MATH.constant_pi(ctx), exact(Fraction(2 * frequency, fs)))
        self.k1 = neg(MATH.interval_unary('cos', w, ctx))
        self.r1 = MATH.interval_unary('sin', w, ctx)

    def coefficients(self, gain):
        if self.cache and self.cache[0] == gain:
            return self.cache[1]
        A = power10(div(gain, exact(40)), self.ctx)
        t = div(self.r1, mul(exact(2), A))
        k2 = div(sub(ONE, t), add(ONE, t))
        r2 = div(mul(exact(2), MATH.interval_unary('sqrt', t, self.ctx)), add(ONE, t))
        c = div(sub(ONE, mul(A, A)), exact(2))
        matrix = [neg(self.k1), neg(mul(self.r1, k2)), self.r1, neg(mul(self.k1, k2))]
        b = [mul(self.r1, r2), mul(self.k1, r2)]
        l, d = [ZERO, mul(c, r2)], add(ONE, mul(c, sub(k2, ONE)))
        # Coefficient balls cover their exact real values; native errors are absent in E1.
        def centered(values):
            centers = [(v[0] + v[1]) << 63 for v in values]
            errors = [max(abs((v[0] << 64) - m), abs((v[1] << 64) - m)) for v, m in zip(values, centers)]
            return centers, norm_up(errors)
        m0, dm = centered(matrix)
        b0, db = centered(b)
        l0, dl = centered(l)
        d0, dd = centered([d])
        result = (m0, dm, b0, db, l0, dl, d0[0], dd)
        self.cache = gain, result
        return result

    def step(self, x, gain):
        self.ctx.check()
        m, dm, b, db, l, dl, d, dd = self.coefficients(gain)
        xc = (x[0] + x[1]) << 63
        ex = max(xc - (x[0] << 64), (x[1] << 64) - xc)
        s = self.center
        # Exact products followed by one 320-bit center quantization; rho includes it.
        numerators = [m[i * 2] * s[0] + m[i * 2 + 1] * s[1] + b[i] * xc for i in (0, 1)]
        def center320(v):
            value = MATH.directed(self.ctx, MATH.g.RoundToNearest, lambda: MATH.g.mpfr(MATH.g.mpq(v, CS * CS)))
            numerator, denominator = value.as_integer_ratio()
            return int(numerator * CS // denominator)
        next_center = [center320(v) for v in numerators]
        rho_s = norm_up([-((-abs(v - center * CS)) // CS) for v, center in zip(numerators, next_center)])
        snorm, bnorm, lnorm = norm_up(s), norm_up(b), norm_up(l)
        up = lambda n: -((-n) // CS)
        # ||M_real||2 <= 1 follows from M^T M=diag(1,k2^2), ONLY for this ideal graph.
        next_radius = self.radius + up(dm * snorm + (bnorm + db) * ex + db * abs(xc)) + rho_s
        v_num = d * xc + l[0] * s[0] + l[1] * s[1]
        vc = center320(v_num)
        rho_v = -((-abs(v_num - vc * CS)) // CS)
        ev = up((lnorm + dl) * self.radius + dl * snorm + (abs(d) + dd) * ex + dd * abs(xc)) + rho_v
        self.center, self.radius = next_center, next_radius
        if gain == ZERO:
            return x
        return MATH.checked((vc - ev) // (1 << 64), -((-(vc + ev)) // (1 << 64)))


def round32(value):
    """Exact rational RN/ties-even, including subnormals; no double rounding."""
    sign = -1 if value < 0 else 1
    n = abs(value)
    if not n:
        return Fraction(0)
    e = n.numerator.bit_length() - n.denominator.bit_length()
    if n < Fraction(2) ** e:
        e -= 1
    shift = max(e - 23, -149)
    scaled = n / (Fraction(2) ** shift)
    q, remainder = divmod(scaled.numerator, scaled.denominator)
    if remainder * 2 > scaled.denominator or remainder * 2 == scaled.denominator and q % 2:
        q += 1
    result = sign * q * Fraction(2) ** shift
    if abs(result) >= Fraction(2) ** 128:
        raise ValueError('i4-float32-overflow')
    return result


def cast32(value):
    return MATH.checked(exact(round32(Fraction(value[0], S)))[0], exact(round32(Fraction(value[1], S)))[1])


def table_value(index):
    x = Fraction(index, 2048) - 1
    a = abs(x)
    if a > Fraction(9, 10):
        p = (a - Fraction(9, 10)) * 10
        a = Fraction(9, 10) * (2 * p ** 3 - 3 * p ** 2 + 1) + Fraction(1, 10) * (p ** 3 - 2 * p ** 2 + p) + Fraction(49, 50) * (-2 * p ** 3 + 3 * p ** 2)
    return round32(-a if x < 0 else a)


TABLE = tuple(table_value(i) for i in range(4097))


def limit(value, ctx):
    ctx.check()
    # The approved table is monotone; endpoint interpolation encloses the whole segment.
    def endpoint(v):
        v = max(Fraction(-1), min(Fraction(1), Fraction(v, S)))
        p = (v + 1) * 2048
        index = min(p.numerator // p.denominator, 4095)
        return TABLE[index] + (TABLE[index + 1] - TABLE[index]) * (p - index)
    a, b = endpoint(value[0]), endpoint(value[1])
    return MATH.checked(exact(a)[0], exact(b)[1])


def separation(a, b):
    return 'SEPARATED' if a[1] < b[0] or b[1] < a[0] else 'UNIDENTIFIABLE'


def validate_case(spec, source):
    fields(spec, ('fs', 'frames', 'sourceFrame', 'channels', 'sourceSha256', 'initial', 'commands'))
    fs, frames, start, lanes = spec['fs'], spec['frames'], spec['sourceFrame'], spec['channels']
    if type(fs) is not int or fs not in (44100, 48000, 96000) or type(frames) is not int or not 1 <= frames <= 256000 or type(start) is not int or not 0 <= start < frames or type(lanes) is not int or lanes not in (1, 2) or frames - start > math.ceil(2.4 * fs) or start > math.ceil(.2 * fs):
        raise ValueError('i4-case-domain')
    if len(source) != frames * lanes * 4 or len(source) > 96 * 1024 * 1024 or hashlib.sha256(source).hexdigest() != spec['sourceSha256']:
        raise ValueError('i4-source-binding')
    if spec['initial'] not in ('raw', 'silent-hold') or type(spec['commands']) is not list or len(spec['commands']) > 256:
        raise ValueError('i4-case-initial')
    previous, seq = -1, 0
    for command in spec['commands']:
        validate_command(command, previous, seq, frames)
        previous, seq = command['frame'], command['seq']
    for n, (v,) in enumerate(struct.iter_unpack('<f', source)):
        if not math.isfinite(v) or n < start * lanes and v != 0:
            raise ValueError('i4-source-domain')


MUTATIONS = ('zero', 'right-zero', 'abs', 'invert', 'swap', 'clone', 'delay-minus-one',
             'delay-plus-one', 'linear480', 'state-reset', 'immediate-source-gain',
             'omit-eq', 'omit-headroom', 'omit-gain', 'omit-delay', 'omit-limiter')


def derive_case(spec, source, ctx, mutation=None):
    if mutation is not None and mutation not in MUTATIONS:
        raise ValueError('i4-mutation')
    validate_case(spec, source)
    control = Control(spec['fs'], spec['initial'], ctx)
    stages = [[Stage(spec['fs'], f, ctx) for f in FREQUENCIES] for _ in (0, 1)]
    ring = [(ZERO, ZERO)] * (control.delay + 1)
    dry = [(ZERO, ZERO)] * (control.delay + 1)
    program, controls = [], []
    commands = iter(spec['commands'])
    command = next(commands, None)
    for n in range(spec['frames']):
        ctx.check()
        while command is not None and command['frame'] == n:
            control.accept(command)
            if mutation == 'state-reset':
                for lane in stages:
                    for stage in lane:
                        stage.center, stage.radius = [0, 0], 0
            command = next(commands, None)
        eq, _, _ = control.tuple(n)
        row = control.frame(n)
        controls.append(row)
        if mutation == 'linear480':
            # Deliberately wrong legacy 480-frame mix, independent of the correct q plan.
            past = [c for c in spec['commands'] if c['frame'] <= n]
            if past:
                latest = past[-1]
                q = exact(Fraction(min(n - latest['frame'], 480), 480))
                if not latest['wanted']:
                    q = sub(ONE, q)
                row = (neg(q), q, row[2], row[3], row[4])
        positive = ZERO
        for value in eq:
            if value[0] >= 0:
                positive = add(positive, value)
            elif value[1] > 0:
                raise ValueError('i4-ambiguous-headroom')
        headroom = power10(div(neg(positive), exact(20)), ctx) if positive != ZERO else ONE
        if mutation == 'omit-headroom':
            headroom = ONE
        samples = [exact(struct.unpack_from('<f', source, (n * spec['channels'] + min(c, spec['channels'] - 1)) * 4)[0]) for c in (0, 1)]
        outputs = []
        for c in (0, 1):
            x = mul(headroom, samples[c])
            for stage, gain in zip(stages[c], eq):
                if mutation != 'omit-eq':
                    x = stage.step(x, gain)
            outputs.append(cast32(x))
        ring[n % len(ring)] = tuple(outputs)
        dry[n % len(dry)] = tuple(samples)
        offset = -1 if mutation == 'delay-minus-one' else 1 if mutation == 'delay-plus-one' else 0
        # D+1 needs one extra history entry; never wrap a future sample into the oracle.
        history = control.delay + offset
        if mutation == 'omit-delay':
            history = 0
        if offset == 1:
            if n == 0:
                plus_wet, plus_raw = ZERO, ZERO
                previous_wet, previous_raw = (ZERO, ZERO), (ZERO, ZERO)
            wet, raw = previous_wet, previous_raw
            previous_wet, previous_raw = ring[(n - control.delay) % len(ring)], dry[(n - control.delay) % len(dry)]
        else:
            wet, raw = ring[(n - history) % len(ring)], dry[(n - history) % len(dry)]
        q, gain = row[1], row[2]
        if mutation == 'immediate-source-gain':
            gain = control.tuple(n)[1]
        if mutation == 'omit-gain':
            gain = ONE
        # K and permit cancel by construction in E1; this is not evidence about a native latch.
        output = []
        for c in (0, 1):
            value = mul(gain, wet[c])
            if mutation != 'omit-limiter':
                value = limit(value, ctx)
            output.append(cast32(add(mul(sub(ONE, q), raw[c]), mul(q, value))))
        if mutation == 'zero':
            output = [ZERO, ZERO]
        elif mutation == 'right-zero':
            output[1] = ZERO
        elif mutation == 'abs':
            output = [(0 if x[0] <= 0 <= x[1] else min(abs(x[0]), abs(x[1])), magnitude(x)) for x in output]
        elif mutation == 'invert':
            output = [neg(x) for x in output]
        elif mutation == 'swap':
            output.reverse()
        elif mutation == 'clone':
            output[1] = output[0]
        program.append(tuple(output))
    return {'program': program, 'controls': controls,
            'stateEnd': [[[str(x) for x in stage.center] for stage in lane] for lane in stages],
            'radiiEnd': [[str(stage.radius) for stage in lane] for lane in stages], 'doneFrame': control.done}


def fields(value, expected):
    if type(value) is not dict or set(value) != set(expected):
        raise ValueError('i4-fields')
    return value


def pairs(rows):
    result = {}
    for key, value in rows:
        if key in result:
            raise ValueError('i4-duplicate')
        result[key] = value
    return result


def bad_constant(value):
    raise ValueError('i4-nonfinite')


def parse_request(raw):
    if len(raw) > 8 * 1024 * 1024:
        raise ValueError('i4-input-cap')
    text = raw.decode('utf8', errors='strict')
    depth, quoted, escaped = 0, False, False
    for c in text:
        if quoted:
            if escaped:
                escaped = False
            elif c == '\\':
                escaped = True
            elif c == '"':
                quoted = False
        elif c == '"':
            quoted = True
        elif c in '[{':
            depth += 1
            if depth > 32:
                raise ValueError('i4-depth')
        elif c in ']}':
            depth -= 1
    obj = json.loads(text, object_pairs_hook=pairs, parse_constant=bad_constant)
    mutant = type(obj) is dict and obj.get('schema') == 'f01-i4-mutation-request-v1'
    graph = mutant or type(obj) is dict and obj.get('schema') == 'f01-i4-math-request-v1'
    fields(obj, ['schema', 'caseId', 'remainingMs', 'case', *(['mutation'] if mutant else [])] if graph else ['caseId', 'remainingMs', 'operations'])
    if mutant and obj['mutation'] not in MUTATIONS:
        raise ValueError('i4-mutation')
    if type(obj['caseId']) is not str or not 1 <= len(obj['caseId']) <= 128:
        raise ValueError('i4-case-id')
    ms = obj['remainingMs']
    if type(ms) not in (int, float) or not math.isfinite(ms) or not 0 < ms <= 120000:
        raise ValueError('i4-budget')
    if graph:
        if type(obj['case']) is not dict:
            raise ValueError('i4-case')
        return obj, None
    ops = obj['operations']
    if type(ops) is not list or not 1 <= len(ops) <= 256:
        raise ValueError('i4-operation-cap')
    parsed = []
    for raw_op in ops:
        if type(raw_op) is not dict:
            raise ValueError('i4-operation')
        name = raw_op.get('op')
        if name == 'pi':
            fields(raw_op, ['op'])
            parsed.append((name,))
            continue
        unary = name in ('exp', 'log', 'sqrt', 'sin', 'cos')
        if not unary and name not in ('add', 'sub', 'mul', 'div'):
            raise ValueError('i4-operation')
        fields(raw_op, ['op', 'a'] if unary else ['op', 'a', 'b'])
        arguments = []
        for key in ('a',) if unary else ('a', 'b'):
            pair = fields(raw_op[key], ['lo', 'hi'])
            arguments.append(MATH.checked(MATH.integer(pair['lo']), MATH.integer(pair['hi'])))
        parsed.append((name, *arguments))
    return obj, parsed


def main():
    raw = sys.stdin.buffer.read(8 * 1024 * 1024 + 1)
    obj, ops = parse_request(raw)
    ctx = MATH.Context(obj['remainingMs'])
    directory = pathlib.Path.cwd()
    for ancestor in (directory, *directory.parents):
        if ancestor.is_symlink() or (hasattr(ancestor, 'is_junction') and ancestor.is_junction()):
            raise ValueError('i4-case-link')
    if {p.name for p in directory.iterdir()} != {'source.f32le', 'boundary.json'}:
        raise ValueError('i4-case-files')
    for name in ('source.f32le', 'boundary.json'):
        p = directory / name
        if p.is_symlink() or not p.is_file():
            raise ValueError('i4-case-file')
    size = (directory / 'source.f32le').stat().st_size
    if (size != 0 if ops is not None else size > 256000 * 8) or (directory / 'boundary.json').stat().st_size != len(raw):
        raise ValueError('i4-case-shape')
    if (directory / 'boundary.json').read_bytes() != raw:
        raise ValueError('i4-boundary-digest')
    if ops is None:
        result = derive_case(obj['case'], (directory / 'source.f32le').read_bytes(), ctx, obj.get('mutation'))
        payload = b''.join(MATH.encode_interval(value) for row in result['program'] for value in row)
        controls = b''.join(struct.pack('<d', float(Fraction(value[0] + value[1], 2 * S))) for row in result['controls'] for value in row)
        if len(payload) + len(controls) > 80 * 1024 * 1024:
            raise ValueError('i4-output-cap')
        descriptors = {}
        for key, name, data in [('program', 'reference.iv512le', payload), ('controls', 'control.f64le', controls)]:
            ctx.check()
            with (directory / name).open('xb') as output:
                output.write(data)
            descriptors[key] = dict(file=name, bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
        header = dict(schema='f01-i4-math-v1', status='READY', caseId=obj['caseId'],
                      versions=[sys.version.split()[0], MATH.g.version(), MATH.g.mpfr_version(), MATH.g.mp_version(), MATH.g.mpc_version()],
                      result=dict(kind='mutation-only' if 'mutation' in obj else 'math-only', frames=obj['case']['frames'], **descriptors,
                                  stateEnd=result['stateEnd'], radiiEnd=result['radiiEnd'], doneFrame=result['doneFrame']))
        ctx.check()
        encoded = json.dumps(header, separators=(',', ':'))
        if len(encoded.encode('utf8')) > 65536:
            raise ValueError('i4-header-cap')
        print(encoded)
        return
    results = []
    for op in ops:
        ctx.check()
        value = (MATH.constant_pi(ctx) if op[0] == 'pi' else
                 MATH.interval_unary(op[0], op[1], ctx) if len(op) == 2 else
                 MATH.interval_binary(op[0], op[1], op[2], ctx))
        results.append(MATH.encode_interval(value))
    payload = b''.join(results)
    ctx.check()
    with (directory / 'reference.iv512le').open('xb') as output:
        output.write(payload)
    ctx.check()
    header = {'schema': 'f01-i4-primitive-v1', 'status': 'READY', 'caseId': obj['caseId'],
              'versions': [sys.version.split()[0], MATH.g.version(), MATH.g.mpfr_version(), MATH.g.mp_version(), MATH.g.mpc_version()],
              'result': {'kind': 'primitive-intervals', 'count': len(ops), 'bytes': len(payload),
                         'sha256': hashlib.sha256(payload).hexdigest(), 'file': 'reference.iv512le'}}
    print(json.dumps(header, separators=(',', ':')))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('{"schema":"f01-i4-primitive-v1","status":"NOT_READY","error":"i4-helper-failed"}')
        sys.exit(1)

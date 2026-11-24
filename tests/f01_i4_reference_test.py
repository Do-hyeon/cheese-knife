"""Independent E1 goldens; never imports the product or an actual capture."""
import hashlib
import importlib.util
import math
import pathlib
import struct
import unittest
import cmath
from fractions import Fraction
from decimal import Decimal, localcontext

FILE = pathlib.Path(__file__).resolve().parents[1] / 'scripts/audio_i4_reference.py'
SPEC = importlib.util.spec_from_file_location('i4_reference_under_test', FILE)
R = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)
S = 1 << 256


def cmd(frame, seq, wanted, gain=1.32, eq=None):
    return dict(frame=frame, seq=seq, wanted=wanted, gain=gain,
                eq=[0, 0, 0, -6, -6, -6, -6, -6] if eq is None else eq,
                sourceEpoch=1)


def point(x):
    f = Fraction(x)
    return R.MATH.rational(f.numerator, f.denominator)


def middle(x):
    return float(Fraction(x[0] + x[1], 2 * S))


class ReferenceTests(unittest.TestCase):
    def test_all_commands_admitted_before_first_frame(self):
        data = bytes(32 * 8)
        spec = dict(fs=48000, frames=32, sourceFrame=0, channels=2,
                    sourceSha256=hashlib.sha256(data).hexdigest(), initial='raw',
                    commands=[cmd(-1, 1, True, 1, [7] * 8), cmd(0, 2, True, 0)])
        with self.assertRaises(ValueError):
            R.derive_case(spec, data, R.MATH.Context())
        for bad in [cmd(20, 0, True), cmd(20, 1, True, 3), cmd(20, 1, True, 1, [7] * 8),
                    dict(cmd(20, 1, True), sourceEpoch=True), dict(cmd(20, 1, True), extra=1)]:
            # Invalid late commands must fail before any source/control/state loop starts.
            with self.assertRaises(ValueError):
                R.validate_case(dict(spec, commands=[bad]), data)

    def test_joint_flat_gain_exact_affine_and_independent_decimal_exponential(self):
        for gain in (.5, 2):
            c = R.Control(48000, 'raw', R.MATH.Context())
            c.accept(cmd(0, 1, True, gain, [0] * 8))
            c.accept(cmd(2048, 2, False, gain, [0] * 8))
            actual = c.tuple(2176)[1]
            if gain == .5:
                golden = Fraction(7, 13)
            else:
                with localcontext() as context:
                    context.prec = 90
                    golden = Fraction((Decimal(2).ln() * Decimal(12) / Decimal(13)).exp())
            self.assertLessEqual(Fraction(actual[0], S), golden)
            self.assertGreaterEqual(Fraction(actual[1], S), golden)
        silent = R.Control(48000, 'silent-hold', R.MATH.Context())
        self.assertTrue(all(silent.frame(n)[2] == point(0) for n in range(288)))
        nonflat = R.Control(96000, 'raw', R.MATH.Context())
        nonflat.accept(cmd(0, 1, True, .5, [0] * 7 + [-6]))
        nonflat.accept(cmd(4096, 2, False))
        actual = nonflat.tuple(5056)[1]
        with localcontext() as context:
            context.prec = 90
            beta = 1 + Decimal(3).sqrt() / 2
            A = (Decimal(10).ln() * Decimal(-3) / 40).exp()
            nu = beta * Decimal(10).ln() / 40 * (A + 1 / A) * 6 / 1792
            golden = Fraction(Decimal('.75') / (1 + nu))
        self.assertLessEqual(Fraction(actual[0], S), golden)
        self.assertGreaterEqual(Fraction(actual[1], S), golden)

    def test_float32_ties_subnormal_and_table_monotonicity(self):
        self.assertEqual(R.round32(Fraction(1) + Fraction(1, 1 << 24)), Fraction(1))
        self.assertEqual(R.round32(Fraction(1, 1 << 150)), Fraction(0))
        self.assertEqual(R.round32(Fraction(3, 1 << 150)), Fraction(1, 1 << 148))
        self.assertEqual(R.round32(-Fraction(3, 1 << 150)), -Fraction(1, 1 << 148))
        self.assertTrue(all(a <= b for a, b in zip(R.TABLE, R.TABLE[1:])))

    def test_rbj_impulses_three_rates_eight_bands_both_signs(self):
        # Independent DF2T complex transfer, used only as a local algebra cross-check.
        # Its double-precision discrepancy is NOT a PCM acceptance tolerance.
        for fs in (44100, 48000, 96000):
            for frequency in R.FREQUENCIES:
                for db in (-6, 6):
                    stage = R.Stage(fs, frequency, R.MATH.Context())
                    A = 10 ** (db / 40)
                    w = 2 * math.pi * frequency / fs
                    alpha = math.sin(w) / 2
                    a0, a1, a2 = 1 + alpha / A, -2 * math.cos(w), 1 - alpha / A
                    b0, b1, b2 = (1 + alpha * A) / a0, -2 * math.cos(w) / a0, (1 - alpha * A) / a0
                    a1, a2 = a1 / a0, a2 / a0
                    headroom = 10 ** (-max(0, db) / 20)
                    s1, s2 = 0., 0.
                    for n in range(4096):
                        x = headroom / 8 if n == 0 else 0
                        golden = b0 * x + s1
                        s1, s2 = b1 * x - a1 * golden + s2, b2 * x - a2 * golden
                        actual = stage.step(point(x), point(db))
                        self.assertAlmostEqual(middle(actual), golden, delta=5e-13)
                    z = cmath.exp(-1j * w)
                    response = (b0 + b1 * z + b2 * z * z) / (1 + a1 * z + a2 * z * z)
                    self.assertAlmostEqual(abs(response), 10 ** (db / 20), delta=2e-10)
                    if db > 0:
                        self.assertNotAlmostEqual(headroom / 8, 1 / 8, places=3)
                    self.assertNotAlmostEqual(b0 * headroom / 8, headroom / 8, delta=1e-8)

    def test_full_graph_positive_headroom_omission(self):
        data = bytearray(4096 * 8)
        struct.pack_into('<ff', data, 2048 * 8, 1 / 8, -1 / 16)
        spec = dict(fs=48000, frames=4096, sourceFrame=0, channels=2,
                    sourceSha256=hashlib.sha256(data).hexdigest(), initial='raw',
                    commands=[cmd(0, 1, True, 1, [0, 0, 6, 0, 0, 0, 0, 0])])
        a = R.derive_case(spec, data, R.MATH.Context())
        b = R.derive_case(spec, data, R.MATH.Context(), 'omit-headroom')
        self.assertEqual(R.separation(a['program'][2336][0], b['program'][2336][0]), 'SEPARATED')

    def test_raw_gain_ring_one_and_delayed_gain(self):
        controls = R.Control(48000, 'raw', R.MATH.Context())
        self.assertEqual(controls.delay, 288)
        controls.accept(cmd(0, 1, True, 0, [0] * 8))
        rows = [controls.frame(n) for n in range(2000)]
        self.assertTrue(all(row[2] == point(1) for row in rows[:288]))
        self.assertEqual(rows[480 + 288][2], point(1))
        self.assertEqual(rows[1440 + 288][2], point(0))
        self.assertEqual(controls.done, 1728)

    def test_q_interior_both_directions_same_frame_and_ceil(self):
        for fs in (44100, 48000, 96000):
            control = R.Control(fs, 'raw', R.MATH.Context())
            control.accept(cmd(256, 1, True))
            n = 256 + fs // 200
            before = control.tuple(n)[2]
            control.accept(cmd(n, 2, False))
            self.assertEqual(before, control.tuple(n)[2])
            self.assertGreater(middle(before), 0)
            self.assertLess(middle(before), 1)
            n2 = math.ceil(n + fs / 50 + control.delay + fs / 200)
            before2 = control.tuple(n2)[2]
            control.accept(cmd(n2, 3, True))
            self.assertEqual(before2, control.tuple(n2)[2])
            control.accept(cmd(n2, 4, False))
            self.assertEqual(control.seq, 4)
            self.assertEqual(control.done, math.ceil(n2 + fs * Fraction(3, 100) + control.delay))

    def test_rapid_prefix_cancel_from_current_tuple(self):
        control = R.Control(48000, 'raw', R.MATH.Context())
        control.accept(cmd(0, 1, True))
        control.accept(cmd(2048, 2, False))
        prefix = control.tuple(2304)
        control.accept(cmd(2176, 3, True))
        self.assertEqual(prefix, control.tuple(2304))
        current = control.tuple(2304)
        control.accept(cmd(2304, 4, False))
        self.assertEqual(current, control.tuple(2304))
        self.assertEqual(control.tuple(6000)[:2], ([point(0)] * 8, point(1)))

    def test_g0_hidden_state_survives_and_norm_ball_96k_8k(self):
        ctx = R.MATH.Context()
        stage = R.Stage(96000, 8000, ctx)
        out = stage.step(point(Fraction(1, 8)), point(0))
        self.assertEqual(out, point(Fraction(1, 8)))
        self.assertTrue(any(value != 0 for value in stage.center))
        for _ in range(4095):
            self.assertEqual(stage.step(point(0), point(0)), point(0))
        self.assertLess(stage.radius, S // (10 ** 50))
        tail = stage.step(point(0), point(-6))
        self.assertNotEqual(tail, point(0))

    def test_eight_stage_coupling_center_rounding_and_wide_radius(self):
        ctx = R.MATH.Context()
        stages = [R.Stage(48000, f, ctx) for f in R.FREQUENCIES]
        x = point(Fraction(1, 8))
        for stage in stages:
            x = stage.step(x, point(6))
            self.assertGreater(stage.radius, 0)
        self.assertGreater(x[1] - x[0], 0)
        self.assertEqual(R.separation(x, x), 'UNIDENTIFIABLE')
        self.assertEqual(R.separation((-S, S), (0, 0)), 'UNIDENTIFIABLE')
        with self.assertRaisesRegex(ValueError, 'native'):
            R.Stage(48000, 63, ctx, native_bounds={})

    def test_limiter_rational_boundaries_and_symmetry(self):
        ctx = R.MATH.Context()
        for x in (Fraction(0), Fraction(1, 8), Fraction(9, 10), Fraction(1), Fraction(2)):
            a, b = R.limit(point(x), ctx), R.limit(point(-x), ctx)
            self.assertEqual(a, (-b[1], -b[0]))
        exact = Fraction(struct.unpack('<f', struct.pack('<f', .98))[0])
        self.assertEqual(R.limit(point(1), ctx), point(exact))
        self.assertNotEqual(R.limit(point(1), ctx), point(1))

    def test_signed_impulse_exact_delay_and_mono_speakers(self):
        for channels in (1, 2):
            data = bytearray(4096 * channels * 4)
            struct.pack_into('<f', data, 128 * channels * 4, 1 / 8)
            if channels == 2:
                struct.pack_into('<f', data, (128 * 2 + 1) * 4, -1 / 8)
            spec = dict(fs=48000, frames=4096, sourceFrame=0, channels=channels,
                        sourceSha256=hashlib.sha256(data).hexdigest(), initial='raw', commands=[])
            result = R.derive_case(spec, bytes(data), R.MATH.Context())
            rows = result['program']
            self.assertEqual(rows[416], (point(Fraction(1, 8)), point(Fraction(1 if channels == 1 else -1, 8))))
            self.assertTrue(all(row == (point(0), point(0)) for n, row in enumerate(rows) if n != 416))
            self.assertEqual(len(result['controls']), 4096)

    def test_mutation_paths_fixed_witnesses_and_unidentifiable_silence(self):
        frames = 4096
        data = b''.join(struct.pack('<ff', (1 if n % 17 < 8 else -1) / 8, (1 if n % 29 < 14 else -1) / 16) for n in range(frames))
        commands = [cmd(0, 1, True), cmd(2048, 2, False), cmd(2176, 3, True, .5)]
        spec = dict(fs=48000, frames=frames, sourceFrame=0, channels=2,
                    sourceSha256=hashlib.sha256(data).hexdigest(), initial='raw', commands=commands)
        reference = R.derive_case(spec, data, R.MATH.Context())
        # Predetermined windows; never search an actual recording for a favorable anchor.
        witnesses = list(range(400, 656)) + list(range(2048, 2432)) + list(range(3800, 4096))
        for name in R.MUTATIONS:
            if name == 'omit-limiter':
                impulse = bytearray(frames * 8)
                struct.pack_into('<ff', impulse, 2048 * 8, 1, -1)
                unit = dict(spec, sourceSha256=hashlib.sha256(impulse).hexdigest(), commands=[cmd(0, 1, True, 1, [0] * 8)])
                limited = R.derive_case(unit, impulse, R.MATH.Context())
                omitted = R.derive_case(unit, impulse, R.MATH.Context(), name)
                expected = point(Fraction(struct.unpack('<f', struct.pack('<f', .98))[0]))
                self.assertEqual(limited['program'][2336][0], expected)
                self.assertEqual(omitted['program'][2336][0], point(1))
                self.assertEqual(R.separation(limited['program'][2336][0], omitted['program'][2336][0]), 'SEPARATED')
                continue
            wrong = R.derive_case(spec, data, R.MATH.Context(), name)
            if name == 'omit-headroom':
                # A cut-only unit has identity headroom: responsibility is the positive-band unit.
                self.assertTrue(all(a == b for a, b in zip(reference['program'], wrong['program'])))
                continue
            self.assertTrue(any(R.separation(reference['program'][n][c], wrong['program'][n][c]) == 'SEPARATED'
                                for n in witnesses for c in (0, 1)), name)
        zero = bytes(frames * 8)
        empty = dict(spec, sourceSha256=hashlib.sha256(zero).hexdigest(), commands=[])
        a = R.derive_case(empty, zero, R.MATH.Context())
        b = R.derive_case(empty, zero, R.MATH.Context(), 'swap')
        self.assertTrue(all(R.separation(x, y) == 'UNIDENTIFIABLE' for row, other in zip(a['program'], b['program']) for x, y in zip(row, other)))


if __name__ == '__main__':
    unittest.main()

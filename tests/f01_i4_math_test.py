import importlib.util
import pathlib
import unittest
from fractions import Fraction

ROOT = pathlib.Path(__file__).resolve().parents[1]


class MathTests(unittest.TestCase):
    def module(self):
        file = ROOT / 'scripts/audio_i4_math.py'
        self.assertTrue(file.is_file(), 'Task2 interval implementation missing')
        spec = importlib.util.spec_from_file_location('i4_test_math', file)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod

    def test_negative_one_third_outward(self):
        m = self.module()
        lo, hi = m.rational(-1, 3)
        self.assertLessEqual(Fraction(lo, 1 << 256), Fraction(-1, 3))
        self.assertGreaterEqual(Fraction(hi, 1 << 256), Fraction(-1, 3))
        self.assertEqual(hi - lo, 1)

    def test_sin_cos_interior_extrema(self):
        m = self.module()
        one = 1 << 256
        for op in ('sin', 'cos'):
            self.assertEqual(m.interval_unary(op, (-4 * one, 4 * one), m.Context()), (-one, one))
        self.assertEqual(m.interval_unary('sin', (0, 0), m.Context()), (0, 0))
        self.assertEqual(m.interval_unary('cos', (0, 0), m.Context()), (one, one))
        pi = m.constant_pi(m.Context())
        # Independent 64-place decimal bound, not another call to the implementation.
        lower = Fraction(3141592653589793238462643383279502884197169399375105820974944592307, 10**66)
        self.assertGreaterEqual(Fraction(pi[0], one), lower)
        self.assertLessEqual(Fraction(pi[1], one), lower + Fraction(1, 10**66))
        half = (pi[0] // 2, (pi[1] + 1) // 2)
        self.assertEqual(m.interval_unary('sin', half, m.Context())[1], one)
        twice = (pi[0] * 2, pi[1] * 2)
        self.assertEqual(m.interval_unary('cos', twice, m.Context())[1], one)
        self.assertLessEqual(m.interval_unary('sin', pi, m.Context())[0], 0)
        self.assertGreaterEqual(m.interval_unary('sin', pi, m.Context())[1], 0)

    def test_divisor_zero_and_log_domain(self):
        m = self.module()
        for op, arg in [('log', m.rational(0)), ('log', m.rational(-1)), ('sqrt', m.rational(-1))]:
            with self.assertRaises(ValueError): m.interval_unary(op, arg, m.Context())
        with self.assertRaises(ValueError): m.interval_binary('div', m.rational(1), (-1, 1), m.Context())

    def test_exact_identities_and_directed_operations(self):
        m = self.module()
        for op, arg, expected in [('exp', 0, 1), ('log', 1, 0), ('sqrt', 4, 2)]:
            self.assertEqual(m.interval_unary(op, m.rational(arg), m.Context()), m.rational(expected))
        for op, a, b, expected in [('add', 1, 2, 3), ('sub', 1, 2, -1), ('mul', -2, 3, -6), ('div', -6, 3, -2)]:
            self.assertEqual(m.interval_binary(op, m.rational(a), m.rational(b), m.Context()), m.rational(expected))

    def test_grid_serialization_rejects_overflow_and_bad_integer(self):
        m = self.module()
        for value in ['01', '-0', '+1', 'NaN', '1'*9866]:
            with self.assertRaises(ValueError): m.integer(value)
        with self.assertRaises(ValueError): m.rational(1 << 256)
        with self.assertRaises(ValueError): m.encode_interval((0, 1 << 511))
        data = m.encode_interval(m.rational(-1, 8))
        self.assertEqual(len(data), 128)
        self.assertEqual(int.from_bytes(data[:64], 'little', signed=True), -(1 << 253))

    def test_helper_wire_caps_duplicates_and_unknown_fields(self):
        file = ROOT / 'scripts/audio_i4_reference.py'
        self.assertTrue(file.is_file(), 'Task2 helper wire implementation missing')
        spec = importlib.util.spec_from_file_location('i4_test_helper', file)
        helper = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(helper)
        for raw in [b'x' * (8 * 1024 * 1024 + 1), b'{"a":1,"a":2}', b'[' * 33 + b']' * 33,
                    b'{"caseId":"x","remainingMs":1,"operations":[],"extra":true}', b'{"value":NaN}']:
            with self.assertRaises(ValueError): helper.parse_request(raw)


if __name__ == '__main__':
    unittest.main()

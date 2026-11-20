"""Run with: .venv/bin/python -m unittest vader.test_keys"""
import os
import tempfile
import unittest

from vader import inputs, keys


class KeysTest(unittest.TestCase):
    def setUp(self):
        self.sent = []
        keys.post = lambda kc, down: self.sent.append((kc, down))
        self.dir = tempfile.TemporaryDirectory()
        keys.PATH = os.path.join(self.dir.name, "paddle-keys.json")
        keys._map, keys._held, keys._sent = None, frozenset(), {}

    def tearDown(self):
        keys.post = keys._post
        self.dir.cleanup()

    def test_hold_and_release(self):
        keys.set_key("M2", "Space")
        keys.feed({"M2"})
        keys.feed({"M2"})  # still held: nothing more is sent
        self.assertEqual(self.sent, [(49, True)])
        keys.feed(set())
        self.assertEqual(self.sent, [(49, True), (49, False)])

    def test_unassigned_paddle_sends_nothing(self):
        keys.set_key("M2", "KeyA")
        keys.feed({"M3"})
        keys.feed(set())
        self.assertEqual(self.sent, [])

    def test_two_paddles_overlap(self):
        keys.set_key("M2", "KeyA")
        keys.set_key("M4", "ShiftLeft")
        keys.feed({"M4"})
        keys.feed({"M4", "M2"})
        keys.feed({"M2"})
        keys.feed(set())
        self.assertEqual(self.sent, [(56, True), (0, True), (56, False), (0, False)])

    def test_changing_the_key_while_held_releases_the_old_one(self):
        keys.set_key("M2", "KeyA")
        keys.feed({"M2"})
        keys.set_key("M2", "KeyB")
        self.assertEqual(self.sent, [(0, True), (0, False)])
        keys.feed(set())  # nothing left to release
        self.assertEqual(self.sent, [(0, True), (0, False)])

    def test_saved_and_reloaded(self):
        keys.set_key("M3", "F5")
        keys.set_key("M2", "KeyA")
        keys.set_key("M2", None)
        keys._map = None
        self.assertEqual(keys.get(), {"M1": None, "M2": None, "M3": "F5", "M4": None})

    def test_rejects_unknown(self):
        with self.assertRaises(ValueError):
            keys.set_key("M9", "KeyA")
        with self.assertRaises(ValueError):
            keys.set_key("M2", "NotAKey")

    def test_paddles_from_the_xinput_report(self):
        # 20-byte Xbox 360 report as macOS hands it over; bytes 17..19 are the controller's raw buttons.
        def report(b3=0, b19=0):
            r = bytearray(20)
            r[1], r[3], r[19] = 0x14, b3, b19
            return bytes(r)
        self.assertEqual(inputs._parse_x(report(b19=0x04))["paddles"], ["M2"])
        self.assertEqual(inputs._parse_x(report(b19=0x30))["paddles"], ["M3", "M4"])
        s = inputs._parse_x(report(b3=0x10, b19=0x04))
        self.assertEqual((s["buttons"], s["paddles"]), (["A", "M2"], ["M2"]))
        self.assertEqual(inputs._parse_x(report()[:14])["paddles"], [])  # a short report has no raw bytes


if __name__ == "__main__":
    unittest.main()

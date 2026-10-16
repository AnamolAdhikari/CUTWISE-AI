import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from engine import Segment, suggest_keeps


class SegmentTests(unittest.TestCase):
    def test_silence_in_middle(self):
        keeps = suggest_keeps(10, [Segment(3, 6)], padding=.1)
        self.assertEqual(keeps, [Segment(0, 3.1), Segment(5.9, 10)])

    def test_no_silence(self):
        self.assertEqual(suggest_keeps(5, []), [Segment(0, 5)])

    def test_full_silence(self):
        self.assertEqual(suggest_keeps(3, [Segment(0, 3)]), [])


if __name__ == "__main__":
    unittest.main()

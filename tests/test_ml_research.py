import importlib.util, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('research',ROOT/'scripts'/'train-ml-research.py')
research=importlib.util.module_from_spec(spec)
spec.loader.exec_module(research)

class TemporalSplitTests(unittest.TestCase):
    def test_maturity_boundary_purges_late_labels(self):
        rows=[dict(date='2021-12-01',exitDate='2021-12-31'),dict(date='2021-12-15',exitDate='2022-01-14'),dict(date='2022-01-04',exitDate='2022-02-08'),dict(date='2022-12-15',exitDate='2023-01-16'),dict(date='2023-01-04',exitDate='2023-02-08')]
        train,cal,test=research.split_rows(rows,2023)
        self.assertEqual(train,[rows[0]])
        self.assertEqual(cal,[rows[2]])
        self.assertEqual(test,[rows[4]])
        self.assertFalse(research.PARAMS['early_stopping'])
    def test_later_outcomes_cannot_enter_frozen_training_or_calibration(self):
        train,cal,test=research.split_rows(research.ROWS,2025)
        self.assertTrue(all(r['exitDate']<='2023-12-31' for r in train))
        self.assertTrue(all(r['exitDate']<='2024-12-31' for r in cal))
        changed=[dict(r,profitable=1-r['profitable']) if r['exitDate']>='2025-01-01' else r for r in research.ROWS]
        again=research.split_rows(changed,2025)
        self.assertEqual(train,again[0])
        self.assertEqual(cal,again[1])

if __name__=='__main__':unittest.main()

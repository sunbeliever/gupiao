import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from train_ranking_research import split_rows,metrics,np

class TemporalSplitTest(unittest.TestCase):
    def test_cross_year_labels_are_not_training_inputs(self):
        rows=[dict(date='2024-12-01',exitDate='2024-12-31'),dict(date='2024-12-20',exitDate='2025-01-21'),dict(date='2025-01-02',exitDate='2025-02-03'),dict(date='2025-12-20',exitDate='2026-01-21')]
        train,test=split_rows(rows,2025)
        self.assertEqual(train,[rows[0]])
        self.assertEqual(test,[rows[2]])
    def test_missing_outcomes_disclose_coverage_without_selecting_replacement_trades(self):
        rows=[dict(date='2025-01-02',excessReturn=.1),dict(date='2025-01-02',excessReturn=-.2)]
        scores=np.asarray([.05,-.1])
        m=metrics(rows,scores,[],{'2025-01-02':dict(featureEligible=3)})
        self.assertEqual(m['observedLabelCoverage'],2/3)
        self.assertNotIn('meanTop3WindowPriceReturn',m)
        self.assertIsNone(metrics(rows,scores,[])['observedLabelCoverage'])
if __name__=='__main__':unittest.main()

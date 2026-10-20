import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from train_cost_aware import split_rows
class CostAwareSplitTest(unittest.TestCase):
    def test_training_uses_only_matured_past_labels_and_inference_keeps_unlabeled_signals(self):
        rows=[dict(date='2022-11-01',exitDate='2022-12-01',label={'netReturn':.1}),dict(date='2022-12-20',exitDate='2023-01-21',label={'netReturn':1}),dict(date='2023-12-29',exitDate='2024-01-29',label=None)]
        train,test=split_rows(rows,2023)
        self.assertEqual(train,[rows[0]]);self.assertEqual(test,[rows[2]])
    def test_a_deferred_distribution_is_not_a_matured_training_label(self):
        rows=[dict(date='2022-12-01',exitDate='2022-12-30',labelAvailableAt='2023-01-03',label={'netReturn':.1})]
        train,_=split_rows(rows,2023)
        self.assertEqual(train,[])
if __name__=='__main__':unittest.main()

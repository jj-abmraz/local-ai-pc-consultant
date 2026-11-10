import io
import json
import unittest
from unittest.mock import patch

import app


def stream_response(answer, ids):
    content = json.dumps({'answer': answer, 'product_ids': ids}, ensure_ascii=False)
    middle = len(content) // 2
    return io.BytesIO(('\n'.join(json.dumps(chunk, ensure_ascii=False) for chunk in [
        {'message': {'content': content[:middle]}, 'done': False},
        {'message': {'content': content[middle:]}, 'done': False},
        {'message': {'content': ''}, 'done': True},
    ]) + '\n').encode())


class BudgetTests(unittest.TestCase):
    def test_budget_formats_and_followup(self):
        for phrase in ['Бюджет до 150000 рублей', 'бюджет 150к', 'до 150 тысяч', 'не дороже 150 000 рублей']:
            with self.subTest(phrase=phrase):
                items, constraints = app.retrieve(['Нужен ПК. ' + phrase, 'Хочу играть в современные игры'])
                self.assertEqual(constraints['budget_rub'], 150000)
                self.assertTrue(items)
                self.assertTrue(all(p['price_rub'] <= 150000 for p in items))

    def test_false_model_comparison_is_not_displayed(self):
        product = dict(app.PRODUCTS[0], id='test', price_rub=129900)
        false_text = 'Вариант стоит 129 900 руб. и выходит за ваш бюджет.'
        with patch('app.urllib.request.urlopen', return_value=stream_response(false_text, ['test'])) as call:
            answer, selected = app.ollama_chat([], [product], {'budget_rub': 150000})
            payload = json.loads(call.call_args.args[0].data)
        self.assertNotIn('выходит за', answer)
        self.assertIn('укладываются в бюджет 150 000', answer)
        self.assertEqual(selected[0]['price_rub'], 129900)
        self.assertIn('20100', payload['messages'][0]['content'])
        self.assertTrue(payload['stream'])

    def test_over_budget_id_is_rejected(self):
        product = dict(app.PRODUCTS[0], id='expensive', price_rub=150001)
        with patch('app.urllib.request.urlopen', return_value=stream_response('Подойдёт.', ['expensive'])):
            with self.assertRaises(ValueError):
                app.ollama_chat([], [product], {'budget_rub': 150000})

    def test_interrupted_stream_is_rejected(self):
        raw = b'{"message":{"content":"{}"},"done":false}\n'
        with patch('app.urllib.request.urlopen', return_value=io.BytesIO(raw)):
            with self.assertRaisesRegex(ValueError, 'Incomplete'):
                app.ollama_chat([], [], {})

    def test_stream_callback_receives_answer_prefixes(self):
        updates = []
        with patch('app.urllib.request.urlopen', return_value=stream_response('Уточните задачи и игры.', [])):
            answer, _ = app.ollama_chat([], [], {}, on_text=updates.append)
        self.assertGreater(len(updates), 1)
        self.assertEqual(updates[-1], answer)
        self.assertTrue(all(answer.startswith(text) for text in updates))

    def test_partial_json_escapes(self):
        content = json.dumps({'answer': 'Привет "мир"\nТест', 'product_ids': []})
        for end in range(1, len(content)+1):
            self.assertTrue('Привет "мир"\nТест'.startswith(app.partial_answer(content[:end])))

    def test_office_advice_survives_budget_check(self):
        advice = 'Для офиса важен удобный экран. Цена 70 000 рублей. Данных о шуме и автономности в каталоге нет.'
        result = app.budget_checked_answer(advice, [app.PRODUCTS[0]], app.PRODUCTS, 80000)
        self.assertIn('Для офиса важен удобный экран.', result)
        self.assertIn('Данных о шуме и автономности в каталоге нет.', result)
        self.assertNotIn('70 000', result)
        self.assertNotIn('игры', result)

    def test_preview_never_inserts_placeholder_or_retracts_sentence(self):
        text = 'Для офиса важен экран. Цена 70 000 рублей. Данных о шуме нет.'
        previous = ''
        for end in range(1, len(text)+1):
            preview = app.consultation_text(text[:end], complete=False)
            self.assertTrue(preview.startswith(previous))
            self.assertNotIn('70 000', preview)
            previous = preview
        final = app.budget_checked_answer(text, [app.PRODUCTS[0]], app.PRODUCTS, 80000)
        self.assertTrue(final.startswith(previous))


if __name__ == '__main__':
    unittest.main()

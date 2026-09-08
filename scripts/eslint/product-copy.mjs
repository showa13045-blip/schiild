export const forbiddenWords = ['所有', 'オーナー', '売却', '出品', '投資', '利回り', '値上がり', 'リターン', '資産', 'レア度', 'ランキング', '達成', '未達', '頑張り', 'お疲れさま', 'ぜひ', 'さあ'];

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Reject prohibited product language and exclamation marks in strings and JSX text.' },
    schema: [],
    messages: { forbidden: 'Prohibited product copy: {{word}}', exclamation: 'Exclamation marks are not permitted in product copy.' },
  },
  create(context) {
    function check(node, value) {
      if (typeof value !== 'string') return;
      for (const word of forbiddenWords) if (value.includes(word)) context.report({ node, messageId: 'forbidden', data: { word } });
      if (/[!！]/u.test(value)) context.report({ node, messageId: 'exclamation' });
    }
    return {
      Literal(node) { check(node, node.value); },
      TemplateElement(node) { check(node, node.value.cooked ?? node.value.raw); },
      JSXText(node) { check(node, node.value); },
    };
  },
};

export default {
  meta: {
    type: 'problem', schema: [],
    messages: { ambiguous: 'Use an explicit domain identifier such as schiilId or schiildId.', terminology: 'Use Custodian terminology; reserve Schiild for an individual generated work.' },
  },
  create(context) {
    return { Identifier(node) {
      if (['id', 'sid', 'sId'].includes(node.name)) context.report({ node, messageId: 'ambiguous' });
      if (/^Owner(?:$|[A-Z])/.test(node.name) || /^owner(?:$|[A-Z])/.test(node.name) || ['SchiildService', 'SchiildModule', 'SchiildConfig'].includes(node.name)) context.report({ node, messageId: 'terminology' });
    } };
  },
};

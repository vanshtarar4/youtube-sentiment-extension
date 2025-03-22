
class SimpleTokenizer {
  constructor() {

    this.stopwords = new Set([
      'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 
      'do', 'does', 'did', 'can', 'could', 'shall', 'should', 'will', 'would', 
      'may', 'might', 'must', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 
      'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their',
      'this', 'that', 'these', 'those', 'in', 'of', 'with'
    ]);
  }

  tokenize(text) {
    const cleanText = text.toLowerCase().replace(/[^\w\s]/g, '');
    return cleanText.split(/\s+/).filter(word => word.length > 0);
  }

  removeStopwords(tokens) {
    return tokens.filter(token => !this.stopwords.has(token));
  }

  process(text) {
    const tokens = this.tokenize(text);
    return this.removeStopwords(tokens);
  }
}

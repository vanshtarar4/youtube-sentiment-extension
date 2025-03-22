// Simple tokenizer for text processing
class SimpleTokenizer {
  constructor() {
    // Common English stopwords
    this.stopwords = new Set([
      'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 
      'do', 'does', 'did', 'can', 'could', 'shall', 'should', 'will', 'would', 
      'may', 'might', 'must', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 
      'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their',
      'this', 'that', 'these', 'those', 'in', 'of', 'with'
    ]);
  }

  // Split text into tokens (words)
  tokenize(text) {
    // Remove punctuation and convert to lowercase
    const cleanText = text.toLowerCase().replace(/[^\w\s]/g, '');
    
    // Split into words
    return cleanText.split(/\s+/).filter(word => word.length > 0);
  }

  // Remove stopwords from tokens
  removeStopwords(tokens) {
    return tokens.filter(token => !this.stopwords.has(token));
  }

  // Process text: tokenize and remove stopwords
  process(text) {
    const tokens = this.tokenize(text);
    return this.removeStopwords(tokens);
  }
}

// This tokenizer is used by the transformer sentiment analyzer
// for more efficient text processing
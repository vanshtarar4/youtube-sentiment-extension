class VaderSentiment {
  constructor() {
    this.lexicon = {
      'good': 1.9, 'great': 3.1, 'excellent': 3.2, 'amazing': 3.3, 'love': 2.4, 
      'awesome': 3.3, 'best': 3.0, 'fantastic': 3.3, 'wonderful': 2.6, 'nice': 1.8,
      'thanks': 1.9, 'thank': 1.9, 'happy': 2.1, 'enjoyed': 2.0, 'like': 1.9,
      'beautiful': 2.5, 'perfect': 3.0, 'impressed': 2.3, 'favorite': 2.1,
      
      'bad': -2.5, 'awful': -3.1, 'terrible': -3.4, 'horrible': -3.2, 'hate': -2.4,
      'worst': -3.0, 'poor': -2.0, 'annoying': -2.2, 'disappointing': -2.3, 
      'boring': -2.1, 'stupid': -2.6, 'waste': -2.3, 'useless': -2.1, 'wrong': -2.1,
      'sad': -1.8, 'ugly': -2.4, 'ridiculous': -2.0,
      
      'not': -1.2, 'never': -1.5, 'no': -1.3, 'cant': -1.2, 'cannot': -1.2
    };
    
    this.booster = {
      'very': 0.293,
      'really': 0.267,
      'extremely': 0.293,
      'so': 0.293,
      'too': 0.293,
      'completely': 0.293,
      'incredibly': 0.293,
      'absolutely': 0.293
    };
    this.negations = [
      'not', 'no', 'never', 'none', 'nobody', 'nothing', 'neither', 'nowhere', 'hardly',
      'barely', 'doesnt', 'dont', 'didnt', 'wasnt', 'shouldnt', 'wouldnt', 'couldnt',
      'wont', 'cant', 'cannot', 'isnt', 'arent', 'aint'
    ];
  }
  
  polarity_scores(text) {
    
    const words = text.toLowerCase().split(/\s+/);
    
    let pos = 0;
    let neg = 0;
    let neu = 0;
    
    let negated = false;
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      if (this.negations.includes(word)) {
        negated = true;
        continue;
      }
      
      let wordScore = this.lexicon[word] || 0;
      
      if (negated) {
        wordScore = -wordScore;
        negated = false;
      }
      
      if (i > 0 && this.booster[words[i-1]]) {
        if (wordScore > 0) {
          wordScore += this.booster[words[i-1]];
        } else if (wordScore < 0) {
          wordScore -= this.booster[words[i-1]];
        }
      }
      
      if (wordScore > 0) {
        pos += wordScore;
      } else if (wordScore < 0) {
        neg += Math.abs(wordScore);
      } else {
        neu += 1;
      }
    }
    
    const total = pos + neg + neu || 1;
    const normalized_pos = pos / total;
    const normalized_neg = neg / total;
    const normalized_neu = neu / total;
    
    let compound = 0;
    if (pos > neg) {
      compound = pos * (1 - normalized_neg/2);
    } else if (neg > pos) {
      compound = -neg * (1 - normalized_pos/2);
    }
    
    compound = Math.max(-1, Math.min(1, compound));
    
    return {
      'pos': normalized_pos,
      'neg': normalized_neg,
      'neu': normalized_neu,
      'compound': compound
    };
  }
}
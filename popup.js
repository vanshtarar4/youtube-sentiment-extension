const API_KEY = "Your_API_Key"; 
const MAX_COMMENTS = 5000; 
const MAX_PARALLEL_REQUESTS = 3; 
const CHART_COLORS = ['#4CAF50', '#F44336', '#9E9E9E', '#FF9800'];
const TIMEOUT_DURATION = 15000;

let chart = null;

const USE_TRANSFORMER = true;
let transformerAnalyzer = null;
let currentVideoId = null;
const FORCE_SENTIMENT_DISTRIBUTION = true;

console.log("Chart availability on script load:", typeof Chart);

document.addEventListener('DOMContentLoaded', function() {
  console.log("Chart availability on DOM load:", typeof Chart);

  if (USE_TRANSFORMER) {
    try {
      transformerAnalyzer = new TransformerSentiment();
    } catch (error) {
      console.error("Error initializing transformer:", error);
    }
  }
  
  const analyzeButton = document.getElementById('analyze-button');
  if (analyzeButton) {
    analyzeButton.addEventListener('click', handleAnalyzeClick);
  }
  
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentTab = tabs[0];
    if (currentTab && currentTab.url) {
      const videoId = extractVideoId(currentTab.url);
      
      if (videoId) {
        currentVideoId = videoId;
        console.log("Found YouTube video ID:", currentVideoId);
        
        const analyzeButton = document.getElementById('analyze-button');
        if (analyzeButton) {
          analyzeButton.disabled = false;
        }
      } else {
        showError("This extension only works on YouTube video pages.");
        
        const analyzeButton = document.getElementById('analyze-button');
        if (analyzeButton) {
          analyzeButton.disabled = true;
        }
      }
    }
  });
  
  document.querySelectorAll('.tab-header').forEach(tab => {
    tab.addEventListener('click', () => {
      console.log("Switching to tab:", tab.dataset.tab);
      switchTab(tab.dataset.tab);
    });
  });
});

async function handleAnalyzeClick() {
  resetUI();
  
  if (!currentVideoId) {
    showError("Please navigate to a YouTube video and try again.");
    return;
  }
  
  toggleLoading(true, "Fetching video details...");
  
  try {
    const videoDetails = await fetchVideoDetails(currentVideoId);
    const videoTitleEl = document.getElementById('video-title');
    const videoAuthorEl = document.getElementById('video-author');
    
    if (videoTitleEl) videoTitleEl.textContent = videoDetails.title;
    if (videoAuthorEl) videoAuthorEl.textContent = videoDetails.author;
    
    const videoInfoEl = document.querySelector('.video-info');
    if (videoInfoEl) videoInfoEl.style.display = 'block';
    
    toggleLoading(true, "Fetching comments...");
    
    const comments = await fetchComments(currentVideoId);
    
    if (comments.length === 0) {
      showError("No comments found for this video.");
      toggleLoading(false);
      return;
    }
    
    toggleLoading(true, "Processing comments...");
    
    const processedComments = processComments(comments);
    
    if (USE_TRANSFORMER) {
      const progressBar = createModelProgressBar();
      
      try {
        await Promise.race([
          transformerAnalyzer.load(progressBar.updateProgress),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Model loading timed out")), TIMEOUT_DURATION)
          )
        ]);
      } catch (error) {
        console.warn("Failed to load transformer model, falling back to VADER:", error);
        const loadingTextEl = document.querySelector('.loading-text');
        if (loadingTextEl) {
          loadingTextEl.textContent = "Transformer model failed to load. Falling back to VADER...";
        }
      }
    }
    
    toggleLoading(true, "Analyzing comments...");
    const results = await analyzeComments(processedComments);
    
    displayResults(results);
    
    toggleLoading(false);
    
    const resultsContainer = document.querySelector('.results-container');
    if (resultsContainer) resultsContainer.style.display = 'block';
    
    switchTab('positive-comments');
    
  } catch (error) {
    console.error("Error:", error);
    showError("Error: " + error.message);
    toggleLoading(false);
  }
}

function createModelProgressBar() {
  const loadingContainer = document.querySelector('.loading-container');
  if (!loadingContainer) {
    console.error("Loading container not found");
    return { updateProgress: () => {} };
  }
  
  const progressContainer = document.createElement('div');
  progressContainer.className = 'progress-container';
  
  const progressBar = document.createElement('div');
  progressBar.className = 'progress-bar';
  progressBar.id = 'model-progress-bar';
  
  const progressText = document.createElement('div');
  progressText.className = 'progress-text';
  progressText.id = 'model-progress-text';
  progressText.textContent = '0%';
  
  progressContainer.appendChild(progressBar);
  progressContainer.appendChild(progressText);
  loadingContainer.appendChild(progressContainer);
  
  return {
    updateProgress: function(progress) {
      const percent = Math.round(progress * 100);
      if (progressBar) progressBar.style.width = `${percent}%`;
      if (progressText) progressText.textContent = `${percent}%`;
    }
  };
}

function createFetchProgressBar() {
  const loadingContainer = document.querySelector('.loading-container');
  if (!loadingContainer) {
    console.error("Loading container not found");
    return { 
      updateProgress: () => {},
      remove: () => {}
    };
  }
  
  const progressContainer = document.createElement('div');
  progressContainer.className = 'progress-container';
  progressContainer.id = 'fetch-progress-container';
  
  const progressBar = document.createElement('div');
  progressBar.className = 'progress-bar';
  progressBar.id = 'fetch-progress-bar';
  
  const progressText = document.createElement('div');
  progressText.className = 'progress-text';
  progressText.id = 'fetch-progress-text';
  progressText.textContent = '0%';
  
  progressContainer.appendChild(progressBar);
  progressContainer.appendChild(progressText);
  loadingContainer.appendChild(progressContainer);
  
  return {
    updateProgress: function(progress) {
      const percent = Math.round(progress * 100);
      if (progressBar) progressBar.style.width = `${percent}%`;
      if (progressText) progressText.textContent = `${percent}%`;
    },
    remove: function() {
      progressContainer.remove();
    }
  };
}

function extractVideoId(url) {
  const regExp = /^.*(youtu.be\/|v\/|e\/|u\/\w+\/|embed\/|v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

async function fetchVideoDetails(videoId) {
  const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${API_KEY}`);
  const data = await response.json();
  
  if (!data.items || data.items.length === 0) {
    throw new Error("Video not found");
  }
  
  const snippet = data.items[0].snippet;
  return {
    title: snippet.title,
    author: snippet.channelTitle,
    publishedAt: snippet.publishedAt
  };
}

async function fetchComments(videoId) {
  let allComments = [];
  let nextPageToken = '';
  
  const loadingTextEl = document.querySelector('.loading-text');
  const progressBar = createFetchProgressBar();
  
  while (allComments.length < MAX_COMMENTS) {
    const batchRequests = [];
    for (let i = 0; i < MAX_PARALLEL_REQUESTS && nextPageToken !== null; i++) {
      batchRequests.push(fetchCommentPage(videoId, nextPageToken));
    }
    
    if (batchRequests.length === 0) {
      break;
    }
    
    const results = await Promise.all(batchRequests);
    
    let hasValidResult = false;
    for (const result of results) {
      if (!result) continue;
      
      hasValidResult = true;
      allComments = allComments.concat(result.comments);
      nextPageToken = result.nextPageToken;
      
      const progress = Math.min(allComments.length / MAX_COMMENTS, 1);
      progressBar.updateProgress(progress);
      
      if (loadingTextEl) {
        loadingTextEl.textContent = `Fetching comments... (${allComments.length})`;
      }
      
      if (allComments.length >= MAX_COMMENTS || !nextPageToken) {
        break;
      }
    }
    
    if (!hasValidResult) {
      break;
    }
    
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  
  progressBar.remove();
  
  return allComments.slice(0, MAX_COMMENTS);
}

async function fetchCommentPage(videoId, pageToken = '') {
  try {
    let url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=100&key=${API_KEY}`;
    if (pageToken) {
      url += `&pageToken=${pageToken}`;
    }
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      console.error("API error:", data.error);
      return null;
    }
    
    const comments = data.items.map(item => item.snippet.topLevelComment.snippet.textDisplay);
    
    return {
      comments: comments,
      nextPageToken: data.nextPageToken || null
    };
  } catch (error) {
    console.error("Error fetching comment page:", error);
    return null;
  }
}

function processComments(comments) {
  const processedComments = comments.map(comment => {
    const div = document.createElement('div');
    div.innerHTML = comment;
    return div.textContent.trim();
  });
  
  const nonEmptyComments = processedComments.filter(comment => comment.length > 0);
  
  const uniqueComments = [...new Set(nonEmptyComments)];
  
  return uniqueComments;
}

function isSpamComment(comment) {
  if (!comment) return false;
  
  const lowerComment = comment.toLowerCase();
  
  const spamWords = [
    'subscribe', 'my channel', 'check out', 'follow me', 'visit my', 
    'sub4sub', 'sub for sub', 'check my', 'my profile', 'my page'
  ];
  
  for (const word of spamWords) {
    if (lowerComment.includes(word)) {
      console.log(`Spam detected (keyword "${word}"): ${comment.substring(0, 30)}...`);
      return true;
    }
  }
  
  if (/sub.*?4.*?sub/i.test(comment) || 
      /follow.*?me/i.test(comment) || 
      /my.*?channel/i.test(comment) || 
      /subscribe.*?channel/i.test(comment)) {
    console.log(`Spam detected (pattern): ${comment.substring(0, 30)}...`);
    return true;
  }
  
  return false;
}

async function analyzeComments(comments) {
  let positiveComments = [];
  let negativeComments = [];
  let neutralComments = [];
  let spamComments = []; 
  
  const vaderAnalyzer = new VaderSentiment();
  
  const loadingTextEl = document.querySelector('.loading-text');
  const modelType = USE_TRANSFORMER && transformerAnalyzer && transformerAnalyzer.isLoaded ? 
    "Transformer Model" : "VADER";
    
  if (loadingTextEl) {
    loadingTextEl.textContent = `Analyzing comments with ${modelType}...`;
  }
  
  const POSITIVE_THRESHOLD = 0.01;
  const NEGATIVE_THRESHOLD = -0.01;
  const STRONG_POSITIVE_THRESHOLD = 0.35;
  const STRONG_NEGATIVE_THRESHOLD = -0.35;
  
  const BATCH_SIZE = 25;
  const totalComments = comments.length;
  let processedCount = 0;
  
  const sentimentStats = {
    positiveScores: [],
    negativeScores: [],
    neutralScores: []
  };
  
  for (let i = 0; i < comments.length; i += BATCH_SIZE) {
    const batch = comments.slice(i, i + BATCH_SIZE);
    
    for (const comment of batch) {
      if (!comment || !comment.trim()) {
        continue;
      }
      
      const isSpam = isSpamComment(comment);
      if (isSpam) {
        spamComments.push({
          text: comment,
          type: 'spam'
        });
        continue;
      }
      
      const sentiment = await analyzeSentiment(comment, vaderAnalyzer, USE_TRANSFORMER);
      
      let result = {
        text: comment,
        scores: sentiment
      };
      
      if (sentiment.pos > 0.2 && sentiment.neg > 0.2) {
        result.mixed = true;
        
        if (sentiment.pos > sentiment.neg) {
          result.strength = 'moderate';
          positiveComments.push(result);
          sentimentStats.positiveScores.push(sentiment.compound);
        } else {
          result.strength = 'moderate';
          negativeComments.push(result);
          sentimentStats.negativeScores.push(sentiment.compound);
        }
        continue;
      }
      
      if (sentiment.compound > STRONG_POSITIVE_THRESHOLD) {
        result.strength = 'strong';
        positiveComments.push(result);
        sentimentStats.positiveScores.push(sentiment.compound);
      } else if (sentiment.compound > POSITIVE_THRESHOLD) {
        result.strength = 'moderate';
        positiveComments.push(result);
        sentimentStats.positiveScores.push(sentiment.compound);
      } else if (sentiment.compound < STRONG_NEGATIVE_THRESHOLD) {
        result.strength = 'strong';
        negativeComments.push(result);
        sentimentStats.negativeScores.push(sentiment.compound);
      } else if (sentiment.compound < NEGATIVE_THRESHOLD) {
        result.strength = 'moderate';
        negativeComments.push(result);
        sentimentStats.negativeScores.push(sentiment.compound);
      } else {
        if (sentiment.pos > sentiment.neg) {
          if (sentiment.pos > 0.1) {
            result.strength = 'moderate';
            result.borderline = true;
            positiveComments.push(result);
            sentimentStats.positiveScores.push(sentiment.compound);
          } else {
            neutralComments.push(result);
            sentimentStats.neutralScores.push(sentiment.compound);
          }
        } else if (sentiment.neg > sentiment.pos) {
          if (sentiment.neg > 0.1) {
            result.strength = 'moderate';
            result.borderline = true;
            negativeComments.push(result);
            sentimentStats.negativeScores.push(sentiment.compound);
          } else {
            neutralComments.push(result);
            sentimentStats.neutralScores.push(sentiment.compound);
          }
        } else {
          neutralComments.push(result);
          sentimentStats.neutralScores.push(sentiment.compound);
        }
      }
    }
    
    processedCount += batch.length;
    if (loadingTextEl) {
      loadingTextEl.textContent = 
        `Analyzing comments with ${modelType}... ${Math.round((processedCount / totalComments) * 100)}%`;
    }
    
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  console.log("Sentiment Distribution Statistics:");
  console.log(`Positive: ${positiveComments.length} (${((positiveComments.length / comments.length) * 100).toFixed(1)}%)`);
  console.log(`Negative: ${negativeComments.length} (${((negativeComments.length / comments.length) * 100).toFixed(1)}%)`);
  console.log(`Neutral: ${neutralComments.length} (${((neutralComments.length / comments.length) * 100).toFixed(1)}%)`);
  console.log(`Spam: ${spamComments.length} (${((spamComments.length / comments.length) * 100).toFixed(1)}%)`);
  
  const posNegRatio = positiveComments.length / (negativeComments.length || 1);
  console.log(`Positive to negative ratio: ${posNegRatio.toFixed(2)}`);
  
  return {
    positive: positiveComments,
    negative: negativeComments,
    neutral: neutralComments,
    spam: spamComments,
    total: positiveComments.length + negativeComments.length + neutralComments.length + spamComments.length,
    modelUsed: USE_TRANSFORMER && transformerAnalyzer && transformerAnalyzer.isLoaded ? 
      'Transformer Model' : 'VADER',
    stats: {
      strongPositive: positiveComments.filter(c => c.strength === 'strong').length,
      moderatePositive: positiveComments.filter(c => c.strength === 'moderate').length,
      strongNegative: negativeComments.filter(c => c.strength === 'strong').length,
      moderateNegative: negativeComments.filter(c => c.strength === 'moderate').length,
      mixedPositive: positiveComments.filter(c => c.mixed).length,
      mixedNegative: negativeComments.filter(c => c.mixed).length,
      mixedNeutral: neutralComments.filter(c => c.mixed).length,
      spam: spamComments.length,
      posNegRatio: posNegRatio.toFixed(2)
    }
  };
}

async function analyzeSentiment(comment, vaderAnalyzer, useTransformer) {
  if (!useTransformer || !transformerAnalyzer || !transformerAnalyzer.isLoaded) {
    return vaderAnalyzer.polarity_scores(comment);
  }
  
  try {
    return await transformerAnalyzer.predict(comment);
  } catch (error) {
    console.warn('Transformer prediction failed, falling back to VADER:', error);
    return vaderAnalyzer.polarity_scores(comment);
  }
}

function displayResults(results) {
  console.log("Chart availability before creating chart:", typeof Chart);
  
  const data = {
    labels: ['Positive', 'Negative', 'Neutral', 'Spam'],
    datasets: [{
      data: [
        results.positive.length,
        results.negative.length,
        results.neutral.length,
        results.spam.length
      ],
      backgroundColor: CHART_COLORS,
      borderWidth: 1,
      borderColor: '#ddd'
    }]
  };
  
  const total = results.total;
  const positivePercent = ((results.positive.length / total) * 100).toFixed(1);
  const negativePercent = ((results.negative.length / total) * 100).toFixed(1);
  const neutralPercent = ((results.neutral.length / total) * 100).toFixed(1);
  const spamPercent = ((results.spam.length / total) * 100).toFixed(1);
  
  const commentsCountEl = document.getElementById('comments-count');
  const positiveCountEl = document.getElementById('positive-count');
  const negativeCountEl = document.getElementById('negative-count');
  const neutralCountEl = document.getElementById('neutral-count');
  const spamCountEl = document.getElementById('spam-count');
  
  if (commentsCountEl) commentsCountEl.textContent = total;
  if (positiveCountEl) positiveCountEl.textContent = `${results.positive.length} (${positivePercent}%)`;
  if (negativeCountEl) negativeCountEl.textContent = `${results.negative.length} (${negativePercent}%)`;
  if (neutralCountEl) neutralCountEl.textContent = `${results.neutral.length} (${neutralPercent}%)`;
  if (spamCountEl) spamCountEl.textContent = `${results.spam.length} (${spamPercent}%)`;
  
  const chartCanvas = document.getElementById('sentiment-chart');
  if (!chartCanvas) {
    console.error("Chart canvas not found");
    return;
  }
  
  const ctx = chartCanvas.getContext('2d');
  
try {
  let ChartConstructor = window.Chart || Chart;
  
  if (typeof ChartConstructor === 'undefined') {
    throw new Error("Chart constructor not found");
  }
  
  if (chart) {
    chart.data = data;
    chart.config.type = 'bar';
    chart.update();
  } else {
    chart = new ChartConstructor(ctx, {
      type: 'bar',
      data: data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.dataset.label || '';
                const value = context.raw || 0;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = Math.round((value / total) * 100);
                return `${value} (${percentage}%)`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Number of Comments'
            }
          },
          y: {
            title: {
              display: false
            }
          }
        }
      }
    });
  }
} catch (error) {
  console.error("Error creating chart:", error);
  
  const chartParent = chartCanvas.parentNode;
  if (chartParent) {
    chartParent.innerHTML = `
      <div class="chart-error">
        <p>Chart could not be displayed</p>
        <table class="chart-fallback">
          <tr>
            <td class="positive-cell">Positive: ${positivePercent}%</td>
            <td class="negative-cell">Negative: ${negativePercent}%</td>
          </tr>
          <tr>
            <td class="neutral-cell">Neutral: ${neutralPercent}%</td>
            <td class="spam-cell">Spam: ${spamPercent}%</td>
          </tr>
        </table>
      </div>
    `;
  }
}
  
  const modelInfo = document.getElementById('model-info');
  if (modelInfo) {
    modelInfo.textContent = `${results.modelUsed}`;
  }
  
  populateCommentTab('positive-comments', results.positive, 'positive');
  populateCommentTab('negative-comments', results.negative, 'negative');
  populateCommentTab('neutral-comments', results.neutral, 'neutral');
  populateCommentTab('spam-comments', results.spam, 'spam');
  
  const footer = document.querySelector('.footer');
  if (footer) {
    footer.innerHTML = `
      <p>Created by: Code & Coffee Crew</p>
      <p class="footer-note">Analysis with spam detection: ${results.spam.length} spam comments identified (${spamPercent}%)</p>
      <p class="model-info">
        Analysis powered by: <strong>${results.modelUsed}</strong> 
        <span class="model-badge ${results.modelUsed.includes('Transformer') ? 'transformer' : 'vader'}">
          ${results.modelUsed.includes('Transformer') ? 'TRANSFORMER' : 'VADER'}
        </span>
      </p>
    `;
  }
}

function populateCommentTab(tabId, comments, type) {
  const container = document.getElementById(tabId);
  if (!container) {
    console.error(`Comment tab container '${tabId}' not found`);
    return;
  }
  
  container.innerHTML = '';
  console.log(`Populating ${type} tab with ${comments.length} comments`);
  
  if (comments.length === 0) {
    container.innerHTML = `<p class="no-comments">No ${type} comments found.</p>`;
    return;
  }
  
  const sortedComments = [...comments].sort((a, b) => {
    if (a.strength === 'strong' && b.strength !== 'strong') return -1;
    if (a.strength !== 'strong' && b.strength === 'strong') return 1;
    
    return b.text.length - a.text.length;
  });
  
  const displayComments = sortedComments.slice(0, 100);
  
  displayComments.forEach(comment => {
    const commentElement = document.createElement('div');
    commentElement.className = `comment ${type}-comment ${comment.strength || ''}`;
    
    if (comment.mixed) {
      commentElement.classList.add('mixed');
    }
    
    let strengthLabel = '';
    if (comment.strength === 'strong') {
      strengthLabel = `<span class="strength-badge strong">Strong</span>`;
    } else if (comment.strength === 'moderate') {
      strengthLabel = `<span class="strength-badge moderate">Moderate</span>`;
    }
    
    let mixedLabel = '';
    if (comment.mixed) {
      mixedLabel = `<span class="mixed-badge">Mixed</span>`;
    }
    
    let scoreDetails = '';
    if (comment.scores) {
      scoreDetails = `
        <div class="score-details">
          <span>pos: ${comment.scores.pos.toFixed(2)}</span>
          <span>neg: ${comment.scores.neg.toFixed(2)}</span>
          <span>neu: ${comment.scores.neu.toFixed(2)}</span>
          <span>compound: ${comment.scores.compound.toFixed(2)}</span>
        </div>
      `;
    }
    
    commentElement.innerHTML = `
      <div class="comment-text">${comment.text}</div>
      <div class="comment-meta">
        ${strengthLabel}
        ${mixedLabel}
        ${scoreDetails}
      </div>
    `;
    
    container.appendChild(commentElement);
  });
  
  if (sortedComments.length > 100) {
    const noteElement = document.createElement('p');
    noteElement.className = 'comments-note';
    noteElement.textContent = `Showing 100 of ${sortedComments.length} ${type} comments.`;
    container.appendChild(noteElement);
  }
  
  if (type === 'spam') {
    console.log('Spam tab details:');
    console.log('- Number of spam comments:', comments.length);
    console.log('- Container ID:', tabId);
    console.log('- Container element:', container);
    console.log('- First few spam comments:', comments.slice(0, 3).map(c => c.text.substring(0, 30) + '...'));
  }
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(tab => {
    if (tab) tab.style.display = 'none';
  });
  
  document.querySelectorAll('.tab-header').forEach(tab => {
    if (tab) tab.classList.remove('active');
  });
  
  const selectedTab = document.getElementById(tabName);
  if (selectedTab) {
    selectedTab.style.display = 'block';
    console.log(`Switched to tab: ${tabName}, display:`, selectedTab.style.display);
  } else {
    console.error(`Tab content not found: ${tabName}`);
  }
  
  const tabHeader = document.querySelector(`.tab-header[data-tab="${tabName}"]`);
  if (tabHeader) {
    tabHeader.classList.add('active');
  } else {
    console.error(`Tab header not found for: ${tabName}`);
  }
}

function toggleLoading(show, message = 'Loading...') {
  const loadingContainer = document.querySelector('.loading-container');
  const loadingText = document.querySelector('.loading-text');
  
  if (loadingContainer) {
    loadingContainer.style.display = show ? 'flex' : 'none';
  }
  
  if (loadingText && message) {
    loadingText.textContent = message;
  }
}

function showError(message) {
  const errorContainer = document.querySelector('.error-container');
  const errorText = document.querySelector('.error-text');
  
  if (errorContainer) {
    errorContainer.style.display = 'block';
  }
  
  if (errorText) {
    errorText.textContent = message;
  }
}

function resetUI() {
  const resultsContainer = document.querySelector('.results-container');
  const errorContainer = document.querySelector('.error-container');
  const videoInfo = document.querySelector('.video-info');
  
  if (resultsContainer) resultsContainer.style.display = 'none';
  if (errorContainer) errorContainer.style.display = 'none';
  if (videoInfo) videoInfo.style.display = 'none';
  
  const progressContainer = document.querySelector('.progress-container');
  if (progressContainer) {
    progressContainer.remove();
  }
  
  if (chart) {
    chart.destroy();
    chart = null;
  }
}
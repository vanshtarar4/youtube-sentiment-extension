// Initialize variables
const API_KEY = "AIzaSyD8p-d80SFDDcox1qNOSeNFYMZnerM2VX4"; 
const MAX_COMMENTS = 5000; // Increased from 2000 to 5000
const MAX_PARALLEL_REQUESTS = 3; // For parallel comment fetching
const CHART_COLORS = ['#4CAF50', '#F44336', '#9E9E9E', '#FF9800'];
const TIMEOUT_DURATION = 15000;

// This will hold our chart instance
let chart = null;

// Flag to use transformer model
const USE_TRANSFORMER = true;
let transformerAnalyzer = null;
let currentVideoId = null;
const FORCE_SENTIMENT_DISTRIBUTION = true;

// Add console logging to debug Chart.js loading
console.log("Chart availability on script load:", typeof Chart);

// Wait for the DOM to be loaded
document.addEventListener('DOMContentLoaded', function() {
  // Debug Chart.js availability
  console.log("Chart availability on DOM load:", typeof Chart);

  // Initialize the transformer analyzer if the flag is set
  if (USE_TRANSFORMER) {
    try {
      transformerAnalyzer = new TransformerSentiment();
    } catch (error) {
      console.error("Error initializing transformer:", error);
    }
  }
  
  // Add event listener to the analyze button
  const analyzeButton = document.getElementById('analyze-button');
  if (analyzeButton) {
    analyzeButton.addEventListener('click', handleAnalyzeClick);
  }
  
  // Check if we're on a YouTube video page
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentTab = tabs[0];
    if (currentTab && currentTab.url) {
      const videoId = extractVideoId(currentTab.url);
      
      if (videoId) {
        // It's a YouTube video
        currentVideoId = videoId;
        console.log("Found YouTube video ID:", currentVideoId);
        
        // Enable the analyze button
        const analyzeButton = document.getElementById('analyze-button');
        if (analyzeButton) {
          analyzeButton.disabled = false;
        }
      } else {
        // Not a YouTube video page
        showError("This extension only works on YouTube video pages.");
        
        // Disable the analyze button
        const analyzeButton = document.getElementById('analyze-button');
        if (analyzeButton) {
          analyzeButton.disabled = true;
        }
      }
    }
  });
  
  // Add event listener to toggle between tabs
  document.querySelectorAll('.tab-header').forEach(tab => {
    tab.addEventListener('click', () => {
      console.log("Switching to tab:", tab.dataset.tab);
      switchTab(tab.dataset.tab);
    });
  });
});

// Handle the analyze button click
async function handleAnalyzeClick() {
  // Reset UI
  resetUI();
  
  // Make sure we have a video ID
  if (!currentVideoId) {
    showError("Please navigate to a YouTube video and try again.");
    return;
  }
  
  // Show loading state
  toggleLoading(true, "Fetching video details...");
  
  try {
    // Fetch video details
    const videoDetails = await fetchVideoDetails(currentVideoId);
    const videoTitleEl = document.getElementById('video-title');
    const videoAuthorEl = document.getElementById('video-author');
    
    if (videoTitleEl) videoTitleEl.textContent = videoDetails.title;
    if (videoAuthorEl) videoAuthorEl.textContent = videoDetails.author;
    
    // Show video info
    const videoInfoEl = document.querySelector('.video-info');
    if (videoInfoEl) videoInfoEl.style.display = 'block';
    
    // Update loading text
    toggleLoading(true, "Fetching comments...");
    
    // Fetch comments
    const comments = await fetchComments(currentVideoId);
    
    if (comments.length === 0) {
      showError("No comments found for this video.");
      toggleLoading(false);
      return;
    }
    
    // Update loading text
    toggleLoading(true, "Processing comments...");
    
    // Process comments to remove duplicates and empty ones
    const processedComments = processComments(comments);
    
    // Create progress bar for model loading
    if (USE_TRANSFORMER) {
      const progressBar = createModelProgressBar();
      
      // Try to load the transformer model
      try {
        // Set up a timeout for model loading
        await Promise.race([
          transformerAnalyzer.load(progressBar.updateProgress),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Model loading timed out")), TIMEOUT_DURATION)
          )
        ]);
      } catch (error) {
        console.warn("Failed to load transformer model, falling back to VADER:", error);
        // Show warning but continue with VADER
        const loadingTextEl = document.querySelector('.loading-text');
        if (loadingTextEl) {
          loadingTextEl.textContent = "Transformer model failed to load. Falling back to VADER...";
        }
      }
    }
    
    // Analyze comments
    toggleLoading(true, "Analyzing comments...");
    const results = await analyzeComments(processedComments);
    
    // Display results
    displayResults(results);
    
    // Hide loading state
    toggleLoading(false);
    
    // Show results container
    const resultsContainer = document.querySelector('.results-container');
    if (resultsContainer) resultsContainer.style.display = 'block';
    
    // Force switch to the first tab to ensure it displays properly
    switchTab('positive-comments');
    
  } catch (error) {
    console.error("Error:", error);
    showError("Error: " + error.message);
    toggleLoading(false);
  }
}

// Create a progress bar for model loading
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

// Create a progress bar for fetching comments
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

// Extract video ID from URL
function extractVideoId(url) {
  const regExp = /^.*(youtu.be\/|v\/|e\/|u\/\w+\/|embed\/|v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// Fetch video details
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

// Improved comment fetching with parallel requests
async function fetchComments(videoId) {
  let allComments = [];
  let nextPageToken = '';
  
  const loadingTextEl = document.querySelector('.loading-text');
  const progressBar = createFetchProgressBar();
  
  // Keep fetching until we have enough comments or run out of pages
  while (allComments.length < MAX_COMMENTS) {
    // Prepare a batch of parallel requests
    const batchRequests = [];
    for (let i = 0; i < MAX_PARALLEL_REQUESTS && nextPageToken !== null; i++) {
      batchRequests.push(fetchCommentPage(videoId, nextPageToken));
    }
    
    if (batchRequests.length === 0) {
      break; // No more requests to make
    }
    
    // Execute parallel requests
    const results = await Promise.all(batchRequests);
    
    // Process results
    let hasValidResult = false;
    for (const result of results) {
      if (!result) continue;
      
      hasValidResult = true;
      allComments = allComments.concat(result.comments);
      nextPageToken = result.nextPageToken;
      
      // Update progress
      const progress = Math.min(allComments.length / MAX_COMMENTS, 1);
      progressBar.updateProgress(progress);
      
      // Update loading text
      if (loadingTextEl) {
        loadingTextEl.textContent = `Fetching comments... (${allComments.length})`;
      }
      
      // Check if we have enough comments or no more pages
      if (allComments.length >= MAX_COMMENTS || !nextPageToken) {
        break;
      }
    }
    
    // If no valid results, break the loop
    if (!hasValidResult) {
      break;
    }
    
    // Short delay to avoid hitting API limits
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  
  // Clean up the progress bar
  progressBar.remove();
  
  // Return comments
  return allComments.slice(0, MAX_COMMENTS);
}

// Helper function to fetch a single page of comments
async function fetchCommentPage(videoId, pageToken = '') {
  try {
    // Construct the URL for the API request
    let url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=100&key=${API_KEY}`;
    if (pageToken) {
      url += `&pageToken=${pageToken}`;
    }
    
    // Fetch comments
    const response = await fetch(url);
    const data = await response.json();
    
    // Check for errors
    if (data.error) {
      console.error("API error:", data.error);
      return null;
    }
    
    // Extract comment texts
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

// Process comments to remove duplicates and empty ones
function processComments(comments) {
  // Convert HTML entities and remove HTML tags
  const processedComments = comments.map(comment => {
    // Create a temporary div to decode HTML entities
    const div = document.createElement('div');
    div.innerHTML = comment;
    return div.textContent.trim();
  });
  
  // Remove empty comments
  const nonEmptyComments = processedComments.filter(comment => comment.length > 0);
  
  // Remove duplicates
  const uniqueComments = [...new Set(nonEmptyComments)];
  
  return uniqueComments;
}

// Enhanced spam detection function
function isSpamComment(comment) {
  // Safeguard against null or undefined
  if (!comment) return false;
  
  // Convert to lowercase for case-insensitive matching
  const lowerComment = comment.toLowerCase();
  
  // Simple words/phrases that strongly indicate spam
  const spamWords = [
    'subscribe', 'my channel', 'check out', 'follow me', 'visit my', 
    'sub4sub', 'sub for sub', 'check my', 'my profile', 'my page'
  ];
  
  // Check if any of these spam indicators are present
  for (const word of spamWords) {
    if (lowerComment.includes(word)) {
      console.log(`Spam detected (keyword "${word}"): ${comment.substring(0, 30)}...`);
      return true;
    }
  }
  
  // More complex patterns (if the simple keyword check doesn't catch everything)
  if (/sub.*?4.*?sub/i.test(comment) || 
      /follow.*?me/i.test(comment) || 
      /my.*?channel/i.test(comment) || 
      /subscribe.*?channel/i.test(comment)) {
    console.log(`Spam detected (pattern): ${comment.substring(0, 30)}...`);
    return true;
  }
  
  return false;
}

// Analyze comments using either VADER or TransformerAnalyzer
// Replace the analyzeComments function with this more aggressive version

// Analyze comments using either VADER or TransformerAnalyzer
// Replace the analyzeComments function with this balanced version

// Replace your analyzeComments function with this unbiased version

async function analyzeComments(comments) {
  let positiveComments = [];
  let negativeComments = [];
  let neutralComments = [];
  let spamComments = []; 
  
  // Create sentiment analyzer instance
  const vaderAnalyzer = new VaderSentiment();
  
  // Update loading text
  const loadingTextEl = document.querySelector('.loading-text');
  const modelType = USE_TRANSFORMER && transformerAnalyzer && transformerAnalyzer.isLoaded ? 
    "Transformer Model" : "VADER";
    
  if (loadingTextEl) {
    loadingTextEl.textContent = `Analyzing comments with ${modelType}...`;
  }
  
  // MINIMAL NEUTRAL RANGE - SYMMETRIC THRESHOLDS (NO BIAS)
  const POSITIVE_THRESHOLD = 0.01;  // Very small neutral zone
  const NEGATIVE_THRESHOLD = -0.01; // Symmetric with positive threshold
  const STRONG_POSITIVE_THRESHOLD = 0.35; // Moderate threshold for strong positive
  const STRONG_NEGATIVE_THRESHOLD = -0.35; // Symmetric with strong positive
  
  // Process comments in batches to prevent UI freezing
  const BATCH_SIZE = 25;
  const totalComments = comments.length;
  let processedCount = 0;
  
  // Track sentiment distribution statistics
  const sentimentStats = {
    positiveScores: [],
    negativeScores: [],
    neutralScores: []
  };
  
  for (let i = 0; i < comments.length; i += BATCH_SIZE) {
    const batch = comments.slice(i, i + BATCH_SIZE);
    
    // Process this batch
    for (const comment of batch) {
      // Skip empty comments
      if (!comment || !comment.trim()) {
        continue;
      }
      
      // Check for spam first
      const isSpam = isSpamComment(comment);
      if (isSpam) {
        spamComments.push({
          text: comment,
          type: 'spam'
        });
        continue; // Skip further processing for this comment
      }
      
      // Analyze sentiment
      const sentiment = await analyzeSentiment(comment, vaderAnalyzer, USE_TRANSFORMER);
      
      // Create result object
      let result = {
        text: comment,
        scores: sentiment
      };
      
      // Check for mixed sentiment
      if (sentiment.pos > 0.2 && sentiment.neg > 0.2) {
        result.mixed = true;
        
        // For mixed sentiment, check which is stronger without bias
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
      
      // Classify based on compound score - use very narrow neutral range
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
        // For truly neutral comments, see if we can break the tie using pos/neg directly
        if (sentiment.pos > sentiment.neg) {
          if (sentiment.pos > 0.1) { // There's at least some positivity
            result.strength = 'moderate';
            result.borderline = true;
            positiveComments.push(result);
            sentimentStats.positiveScores.push(sentiment.compound);
          } else {
            neutralComments.push(result);
            sentimentStats.neutralScores.push(sentiment.compound);
          }
        } else if (sentiment.neg > sentiment.pos) {
          if (sentiment.neg > 0.1) { // There's at least some negativity
            result.strength = 'moderate';
            result.borderline = true;
            negativeComments.push(result);
            sentimentStats.negativeScores.push(sentiment.compound);
          } else {
            neutralComments.push(result);
            sentimentStats.neutralScores.push(sentiment.compound);
          }
        } else {
          // Truly neutral with no sentiment in either direction
          neutralComments.push(result);
          sentimentStats.neutralScores.push(sentiment.compound);
        }
      }
    }
    
    // Update progress
    processedCount += batch.length;
    if (loadingTextEl) {
      loadingTextEl.textContent = 
        `Analyzing comments with ${modelType}... ${Math.round((processedCount / totalComments) * 100)}%`;
    }
    
    // Add a small delay to prevent UI freezing
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  // Log sentiment distribution statistics
  console.log("Sentiment Distribution Statistics:");
  console.log(`Positive: ${positiveComments.length} (${((positiveComments.length / comments.length) * 100).toFixed(1)}%)`);
  console.log(`Negative: ${negativeComments.length} (${((negativeComments.length / comments.length) * 100).toFixed(1)}%)`);
  console.log(`Neutral: ${neutralComments.length} (${((neutralComments.length / comments.length) * 100).toFixed(1)}%)`);
  console.log(`Spam: ${spamComments.length} (${((spamComments.length / comments.length) * 100).toFixed(1)}%)`);
  
  // Check sentiment distribution
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

// The sentiment analysis function that can use either VADER or Transformer
async function analyzeSentiment(comment, vaderAnalyzer, useTransformer) {
  if (!useTransformer || !transformerAnalyzer || !transformerAnalyzer.isLoaded) {
    return vaderAnalyzer.polarity_scores(comment);
  }
  
  try {
    // Try Transformer-based analysis
    return await transformerAnalyzer.predict(comment);
  } catch (error) {
    console.warn('Transformer prediction failed, falling back to VADER:', error);
    // Fall back to VADER
    return vaderAnalyzer.polarity_scores(comment);
  }
}

// Display analysis results
function displayResults(results) {
  // Debug Chart availability
  console.log("Chart availability before creating chart:", typeof Chart);
  
  // Set up data for chart
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
  
  // Calculate percentages
  const total = results.total;
  const positivePercent = ((results.positive.length / total) * 100).toFixed(1);
  const negativePercent = ((results.negative.length / total) * 100).toFixed(1);
  const neutralPercent = ((results.neutral.length / total) * 100).toFixed(1);
  const spamPercent = ((results.spam.length / total) * 100).toFixed(1);
  
  // Update summary
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
  
  // Create or update chart
  const chartCanvas = document.getElementById('sentiment-chart');
  if (!chartCanvas) {
    console.error("Chart canvas not found");
    return;
  }
  
  const ctx = chartCanvas.getContext('2d');
  
  // Find the displayResults function in your popup.js file and update the chart creation section:

// Inside the displayResults function, find the chart creation code and replace it with this:

// Try multiple ways to ensure Chart is available
try {
  // First try the global Chart variable
  let ChartConstructor = window.Chart || Chart;
  
  if (typeof ChartConstructor === 'undefined') {
    throw new Error("Chart constructor not found");
  }
  
  if (chart) {
    chart.data = data;
    chart.config.type = 'bar'; // Change to bar
    chart.update();
  } else {
    // Create new bar chart
    chart = new ChartConstructor(ctx, {
      type: 'bar',  // Changed from 'doughnut' to 'bar'
      data: data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',  // Horizontal bar chart
        plugins: {
          legend: {
            display: false  // Hide legend since labels are on bars
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
  
  // Show a fallback text representation instead of the chart
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
  
  // Display model information
  const modelInfo = document.getElementById('model-info');
  if (modelInfo) {
    modelInfo.textContent = `${results.modelUsed}`;
  }
  
  // Populate comment tabs
  populateCommentTab('positive-comments', results.positive, 'positive');
  populateCommentTab('negative-comments', results.negative, 'negative');
  populateCommentTab('neutral-comments', results.neutral, 'neutral');
  populateCommentTab('spam-comments', results.spam, 'spam');
  
  // Show footer with additional stats
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

// Populate a tab with comments
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
  
  // Sort comments: strong ones first, then by length (longer ones first)
  const sortedComments = [...comments].sort((a, b) => {
    // Strong comments first
    if (a.strength === 'strong' && b.strength !== 'strong') return -1;
    if (a.strength !== 'strong' && b.strength === 'strong') return 1;
    
    // Longer comments first
    return b.text.length - a.text.length;
  });
  
  // Only display the first 100 comments to avoid performance issues
  const displayComments = sortedComments.slice(0, 100);
  
  // Add each comment to the container
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
    
    // Add scores if available (for debug)
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
  
  // Add a note if we're not showing all comments
  if (sortedComments.length > 100) {
    const noteElement = document.createElement('p');
    noteElement.className = 'comments-note';
    noteElement.textContent = `Showing 100 of ${sortedComments.length} ${type} comments.`;
    container.appendChild(noteElement);
  }
  
  // Add debugging for spam tab display
  if (type === 'spam') {
    console.log('Spam tab details:');
    console.log('- Number of spam comments:', comments.length);
    console.log('- Container ID:', tabId);
    console.log('- Container element:', container);
    console.log('- First few spam comments:', comments.slice(0, 3).map(c => c.text.substring(0, 30) + '...'));
  }
}

// Switch between tabs
function switchTab(tabName) {
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(tab => {
    if (tab) tab.style.display = 'none';
  });
  
  // Remove active class from all tab headers
  document.querySelectorAll('.tab-header').forEach(tab => {
    if (tab) tab.classList.remove('active');
  });
  
  // Show the selected tab content
  const selectedTab = document.getElementById(tabName);
  if (selectedTab) {
    selectedTab.style.display = 'block';
    console.log(`Switched to tab: ${tabName}, display:`, selectedTab.style.display);
  } else {
    console.error(`Tab content not found: ${tabName}`);
  }
  
  // Add active class to the selected tab header
  const tabHeader = document.querySelector(`.tab-header[data-tab="${tabName}"]`);
  if (tabHeader) {
    tabHeader.classList.add('active');
  } else {
    console.error(`Tab header not found for: ${tabName}`);
  }
}

// Toggle loading state
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

// Show error message
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

// Reset UI
function resetUI() {
  // Hide results and error
  const resultsContainer = document.querySelector('.results-container');
  const errorContainer = document.querySelector('.error-container');
  const videoInfo = document.querySelector('.video-info');
  
  if (resultsContainer) resultsContainer.style.display = 'none';
  if (errorContainer) errorContainer.style.display = 'none';
  if (videoInfo) videoInfo.style.display = 'none';
  
  // Remove any existing progress bar
  const progressContainer = document.querySelector('.progress-container');
  if (progressContainer) {
    progressContainer.remove();
  }
  
  // Reset chart
  if (chart) {
    chart.destroy();
    chart = null;
  }
}
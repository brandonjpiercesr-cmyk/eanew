// CANEW autonomous task execution engine
// Self-modifying agent that reads and writes its own files

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const REPO_OWNER = 'brandonjpiercesr-cmyk';
const REPO_NAME = 'EANEW';
const FILE_PATH = 'ask/consult.js';
const BRANCH = 'main';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

// Helper: fetch file content and SHA from GitHub API
function fetchFileSha(callback) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}?ref=${BRANCH}`;
  const options = {
    headers: {
      'User-Agent': 'CANEW',
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  };

  https.get(url, options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        const parsed = JSON.parse(data);
        const content = Buffer.from(parsed.content, 'base64').toString('utf8');
        const sha = parsed.sha;
        callback(null, { content, sha });
      } else if (res.statusCode === 404) {
        console.error('File not found at', url);
        callback(new Error('File not found'), null);
      } else {
        console.error('Unexpected status:', res.statusCode, data);
        callback(new Error('Fetch failed'), null);
      }
    });
  }).on('error', (err) => {
    console.error('HTTP error:', err);
    callback(err, null);
  });
}

// Helper: update file via PUT with SHA
function updateFile(newContent, sha, callback) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;
  const putData = JSON.stringify({
    message: 'Set max_tokens to 1000 for full answers',
    content: Buffer.from(newContent).toString('base64'),
    sha: sha,
    branch: BRANCH
  });

  const options = {
    method: 'PUT',
    headers: {
      'User-Agent': 'CANEW',
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(putData)
    }
  };

  const req = https.request(url, options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      if (res.statusCode === 200 || res.statusCode === 201) {
        console.log('File updated successfully');
        callback(null, 'success');
      } else {
        console.error('Update failed with status', res.statusCode, data);
        callback(new Error('Update failed'), null);
      }
    });
  });

  req.write(putData);
  req.end();
}

// Main execution
function main() {
  console.log('Fetching current ask/consult.js...');
  fetchFileSha((err, result) => {
    if (err) {
      console.error('Failed to fetch file:', err.message);
      process.exit(1);
    }
    const { content, sha } = result;
    console.log('Current content found. Checking max_tokens...');

    // Parse and modify max_tokens
    // Expect format: const max_tokens = 30; or similar
    const regex = /(const\s+max_tokens\s*=\s*)(\d+)/;
    const match = content.match(regex);
    if (!match) {
      console.error('Could not find max_tokens in content');
      process.exit(1);
    }

    const currentValue = parseInt(match[2], 10);
    console.log('Current max_tokens:', currentValue);

    // Replace with 1000
    const updatedContent = content.replace(regex, `$1${1000}`);
    console.log('New content:', updatedContent);

    // Check the SHA is valid before PUT
    if (!sha || sha.length < 40) {
      console.error('Invalid SHA from fetch');
      process.exit(1);
    }

    console.log('Updating file with new max_tokens...');
    updateFile(updatedContent, sha, (err2, result2) => {
      if (err2) {
        console.error('Update failed:', err2.message);
        process.exit(1);
      }
      console.log('Update succeeded. Commit made.');
    });
  });
}

main();
const MAX_TOKENS = 1000; // Updated max_tokens value to 1000

// Use the GitHub API to update the file
const githubApiUrl = 'https://api.github.com/repos/brandonjpiercesr-cmyk/anew/contents/ask/consult.js?ref=main';
const updatedContent = 'Updated max_tokens value to 1000';
const accessToken = 'YOUR_GITHUB_ACCESS_TOKEN';
const sha = '';

// Perform GET request to retrieve the file's current SHA and content
fetch(githubApiUrl)
  .then(response => response.json())
  .then(data => {
    sha = data.sha;
    const putUrl = `https://api.github.com/repos/brandonjpiercesr-cmyk/anew/contents/ask/consult.js`;
    const putData = {
      'message': `Update max_tokens value to 1000 - ACL_STAMP`,
      'content': Buffer.from(updatedContent).toString('base64'),
      'sha': sha,
      'branch': 'main'
    };
    const putOptions = {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(putData)
    };
    // Perform PUT request to update the file
    fetch(putUrl, putOptions)
      .then(response => response.json())
      .then(data => console.log(data))
      .catch(error => console.error(error));
  })
  .catch(error => console.error(error));
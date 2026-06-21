import axios from 'axios';

const askHandler = async (question) => {
  try {
    const response = await axios.post('https://api.openrouter.io/v1/llm', {
      prompt: question,
      max_tokens: 800
    });
    const answer = response.data.answer;
    // Removed the .slice(0, 89) to prevent truncation
    return answer;
  } catch (error) {
    console.error(error);
    return 'Error occurred while processing the question.';
  }
};

export default askHandler;
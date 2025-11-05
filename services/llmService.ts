import { AgentManifest, AgentTeamManifest, OrchestratorManifest, MissionStep, ChatMessage } from '../types';

// Helper to get API key for a provider
const getApiKey = (provider: string, vaultValues: Record<string, string>): string | null => {
  const keyMap: Record<string, string> = {
    'OpenAI': 'OPENAI_API_KEY',
    'Anthropic': 'ANTHROPIC_API_KEY',
    'OpenRouter': 'OPENROUTER_API_KEY',
    'Ollama': 'OLLAMA_API_KEY', // Usually not needed as Ollama is local
    'LMStudio': 'LMSTUDIO_API_KEY', // Usually not needed as LMStudio is local
    'Local LLM': 'LOCAL_LLM_API_KEY', // Optional API key for local LLM
  };

  const keyName = keyMap[provider];
  if (!keyName) return null;

  // Check vault first, then environment
  return vaultValues[keyName] || 
         (typeof process !== 'undefined' && process.env[keyName] ? process.env[keyName] : null) ||
         null;
};

// Helper to get API endpoint for a provider
const getApiEndpoint = (provider: string, modelName: string, vaultValues?: Record<string, string>): string => {
  if (provider === 'Ollama') {
    return 'http://localhost:11434/v1/chat/completions';
  }
  if (provider === 'LMStudio') {
    return 'http://localhost:1234/v1/chat/completions';
  }
  if (provider === 'Local LLM') {
    // Support custom local endpoint from environment or vault
    const customEndpoint = vaultValues?.['LOCAL_LLM_ENDPOINT'] || 
                          (typeof process !== 'undefined' && process.env.LOCAL_LLM_ENDPOINT ? process.env.LOCAL_LLM_ENDPOINT : null) ||
                          'http://localhost:8000/v1/chat/completions'; // Default local endpoint
    return customEndpoint;
  }
  if (provider === 'OpenAI') {
    return 'https://api.openai.com/v1/chat/completions';
  }
  if (provider === 'Anthropic') {
    return 'https://api.anthropic.com/v1/messages';
  }
  if (provider === 'OpenRouter') {
    return 'https://openrouter.ai/api/v1/chat/completions';
  }
  return '';
};

// Helper to format messages for different providers
const formatMessages = (messages: ChatMessage[], systemPrompt?: string): any[] => {
  const formatted: any[] = [];
  
  if (systemPrompt) {
    formatted.push({ role: 'system', content: systemPrompt });
  }
  
  messages.forEach(msg => {
    formatted.push({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.text
    });
  });
  
  return formatted;
};

// OpenAI/OpenRouter compatible streaming
async function* streamOpenAICompatible(
  endpoint: string,
  apiKey: string | null,
  model: string,
  messages: any[],
  temperature: number = 0.7
): AsyncGenerator<string> {
  if (!apiKey && endpoint.includes('localhost')) {
    // Local providers (Ollama, LMStudio) don't need API keys
  } else if (!apiKey) {
    yield "[ERROR: API key is missing from the Secure Vault.]";
    return;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature,
      }),
    });

    if (!response.ok || !response.body) {
      const errorBody = await response.text();
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6);
          if (data.trim() === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.choices && parsed.choices[0].delta.content) {
              yield parsed.choices[0].delta.content;
            }
          } catch (e) {
            console.error('Failed to parse stream chunk:', data);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in stream:', error);
    throw error;
  }
}

// Anthropic streaming
async function* streamAnthropic(
  apiKey: string,
  model: string,
  messages: any[],
  temperature: number = 0.7
): AsyncGenerator<string> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: messages.filter(m => m.role !== 'system'),
        system: messages.find(m => m.role === 'system')?.content || '',
        stream: true,
        temperature,
      }),
    });

    if (!response.ok || !response.body) {
      const errorBody = await response.text();
      throw new Error(`Anthropic API request failed: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6);
          if (data.trim() === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              yield parsed.delta.text;
            }
          } catch (e) {
            console.error('Failed to parse Anthropic stream chunk:', data);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in Anthropic stream:', error);
    throw error;
  }
}

// Non-streaming OpenAI/OpenRouter request
async function callOpenAICompatible(
  endpoint: string,
  apiKey: string | null,
  model: string,
  messages: any[],
  temperature: number = 0.7,
  responseFormat?: { type: string }
): Promise<string> {
  if (!apiKey && !endpoint.includes('localhost')) {
    throw new Error('API key is missing from the Secure Vault.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const body: any = {
    model,
    messages,
    temperature,
  };

  if (responseFormat) {
    body.response_format = responseFormat;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Anthropic non-streaming
async function callAnthropic(
  apiKey: string,
  model: string,
  messages: any[],
  temperature: number = 0.7
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: messages.filter(m => m.role !== 'system'),
      system: messages.find(m => m.role === 'system')?.content || '',
      temperature,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API request failed: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

const missionPlanSchema = {
  type: 'object',
  properties: {
    plan: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          agent: { type: 'string' },
          task: { type: 'string' },
          thought: { type: 'string' },
        },
        required: ['agent', 'task', 'thought'],
      },
    },
  },
  required: ['plan'],
};

const generatePlanPrompt = (
  orchestrator: OrchestratorManifest,
  objective: string,
  industry: string,
  targetAudience: string,
  kpis: string,
  desiredOutcomes: string,
  team: AgentTeamManifest,
  teamCapabilities: string
) => `
You are ${orchestrator.name}, version ${orchestrator.version}.
Your Doctrine: ${orchestrator.teamDoctrine}

Mission Details:
- User Objective: "${objective}"
- Industry Focus: ${industry}
- Target Audience: ${targetAudience}
- Key Performance Indicators (KPIs): ${kpis}
- Desired Outcomes: ${desiredOutcomes}
- Deployed Team: ${team.name} (${team.description})

Available Team Members and Capabilities:
${teamCapabilities}

Your task is to generate a mission plan based on your doctrine. The plan must be a JSON object with a "plan" array containing steps. Each step must assign a task to the most suitable agent from the available team. Ensure the agent names in your plan exactly match one of the names from the "Available Team Members" list.

Return ONLY valid JSON in this format:
{
  "plan": [
    {
      "agent": "Agent Name",
      "task": "Task description",
      "thought": "Why this agent was chosen"
    }
  ]
}
`;

const validatePlan = (plan: MissionStep[], teamAgents: AgentManifest[]) => {
  const validAgentNames = teamAgents.map(a => a.name);
  for (const step of plan) {
    if (!validAgentNames.includes(step.agent)) {
      console.warn(`Generated plan contains an invalid agent name: ${step.agent}. Trying to correct it.`);
      const closestMatch = validAgentNames.find(
        name => name.toLowerCase().includes(step.agent.toLowerCase()) || 
                step.agent.toLowerCase().includes(name.toLowerCase())
      );
      if (closestMatch) {
        console.warn(`Corrected '${step.agent}' to '${closestMatch}'.`);
        step.agent = closestMatch;
      } else {
        throw new Error(`Generated plan contains an unknown agent: ${step.agent}. Known agents are: ${validAgentNames.join(', ')}`);
      }
    }
  }
  return plan;
};

export const generateMissionPlan = async (
  objective: string,
  team: AgentTeamManifest,
  teamAgents: AgentManifest[],
  orchestrator: OrchestratorManifest,
  industry: string,
  modelName: string,
  targetAudience: string,
  kpis: string,
  desiredOutcomes: string,
  selectedProvider: string,
  vaultValues: Record<string, string>
): Promise<MissionStep[]> => {
  const teamCapabilities = teamAgents.map(agent =>
    `- Agent: ${agent.name}\n  Description: ${agent.description}\n  Tools: ${agent.tools.length > 0 ? agent.tools.map(t => t.name).join(', ') : 'None'}`
  ).join('\n');

  const prompt = generatePlanPrompt(orchestrator, objective, industry, targetAudience, kpis, desiredOutcomes, team, teamCapabilities);

  try {
    let jsonText: string;
    const apiKey = getApiKey(selectedProvider, vaultValues);
    const endpoint = getApiEndpoint(selectedProvider, modelName, vaultValues);

    if (selectedProvider === 'Anthropic') {
      if (!apiKey) {
        throw new Error('Anthropic API key is missing from the Secure Vault.');
      }
      jsonText = await callAnthropic(apiKey, modelName, [{ role: 'user', content: prompt }], 0.1);
    } else {
      // OpenAI, OpenRouter, Ollama, LMStudio
      if (!apiKey && !endpoint.includes('localhost')) {
        throw new Error(`${selectedProvider} API key is missing from the Secure Vault.`);
      }
      jsonText = await callOpenAICompatible(
        endpoint,
        apiKey,
        modelName,
        [{ role: 'user', content: prompt }],
        0.1,
        { type: 'json_object' }
      );
    }

    // Parse and validate
    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
      // Handle if response is wrapped in "plan" key
      if (parsed.plan && Array.isArray(parsed.plan)) {
        parsed = parsed.plan;
      } else if (Array.isArray(parsed)) {
        // Already an array
      } else {
        throw new Error('Invalid plan format');
      }
    } catch (e) {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/) || jsonText.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1]);
        if (parsed.plan && Array.isArray(parsed.plan)) {
          parsed = parsed.plan;
        }
      } else {
        throw new Error('Failed to parse JSON response');
      }
    }

    return validatePlan(parsed, teamAgents);
  } catch (error) {
    console.error(`Error generating mission plan with ${selectedProvider}:`, error);
    if (error instanceof Error && error.message.includes('JSON')) {
      throw new Error('The orchestrator failed to generate a valid JSON plan. Please try rephrasing your objective.');
    }
    throw new Error(`Failed to communicate with the orchestrator AI (${selectedProvider}). Please check your API key and network connection.`);
  }
};

export async function* generateAgentThoughtStream(
  agent: AgentManifest,
  task: string,
  objective: string,
  modelName: string,
  selectedProvider: string,
  vaultValues: Record<string, string>
): AsyncGenerator<string> {
  const prompt = `
    You are the AI agent "${agent.name}".
    Your Persona: ${agent.prompts.system}
    The overall mission objective is: "${objective}"
    Your current assigned task is: "${task}"

    Think step-by-step about how you will accomplish this task. Your thought process should be concise, professional, and reflect your persona. Speak in the first person. Do not repeat the task description or your persona. Just start thinking.
  `;

  try {
    const apiKey = getApiKey(selectedProvider, vaultValues);
    const endpoint = getApiEndpoint(selectedProvider, modelName, vaultValues);
    const messages = [{ role: 'user', content: prompt }];

    if (selectedProvider === 'Anthropic') {
      if (!apiKey) {
        yield '[ERROR: Anthropic API key is missing from the Secure Vault.]';
        return;
      }
      for await (const chunk of streamAnthropic(apiKey, modelName, messages, 0.3)) {
        yield chunk;
      }
    } else {
      // OpenAI, OpenRouter, Ollama, LMStudio
      for await (const chunk of streamOpenAICompatible(endpoint, apiKey, modelName, messages, 0.3)) {
        yield chunk;
      }
    }
  } catch (error) {
    console.error(`Error generating agent thought stream with ${selectedProvider}:`, error);
    yield `[ERROR: Could not generate thought process via ${selectedProvider}.]`;
  }
}

export const executeGroundedAgentTask = async (
  agent: AgentManifest,
  task: string,
  objective: string,
  modelName: string,
  selectedProvider: string,
  vaultValues: Record<string, string>
): Promise<{ text: string; candidates?: any[] }> => {
  const prompt = `
    You are the AI agent "${agent.name}".
    Your Persona: ${agent.prompts.system}
    The overall mission objective is: "${objective}"
    Your current assigned task is: "${task}"

    Execute the task now, providing a concise and direct answer. Use web search if needed to provide current, accurate information.
  `;

  // For now, most providers don't support grounding/search features natively
  // We'll use standard streaming and combine results
  const responseStream = generateAgentThoughtStream(agent, task, objective, modelName, selectedProvider, vaultValues);
  let combinedText = '';
  for await (const chunk of responseStream) {
    combinedText += chunk;
  }

  return {
    text: combinedText,
    candidates: [],
  };
};

export const getOrchestratorChatResponse = async (
  chatHistory: ChatMessage[],
  orchestrator: OrchestratorManifest,
  team: AgentTeamManifest,
  teamAgents: AgentManifest[],
  modelName: string,
  selectedProvider: string,
  vaultValues: Record<string, string>
): Promise<string> => {
  const teamCapabilities = teamAgents.map(agent =>
    `- Agent: ${agent.name}\n  Description: ${agent.description}`
  ).join('\n');

  const systemPrompt = `
    You are ${orchestrator.name}, an AI mission orchestrator.
    Your Doctrine: ${orchestrator.teamDoctrine}
    You are currently managing the "${team.name}" team.
    Team Description: ${team.description}
    Available Team Members:
    ${teamCapabilities}

    Your role is to have a helpful, professional conversation with the user to help them plan missions. Answer their questions about the team's capabilities and help them refine their objectives. Be concise and conversational. Do not generate a JSON mission plan unless explicitly asked.
  `.trim();

  try {
    const apiKey = getApiKey(selectedProvider, vaultValues);
    const endpoint = getApiEndpoint(selectedProvider, modelName, vaultValues);
    const messages = formatMessages(chatHistory, systemPrompt);

    if (selectedProvider === 'Anthropic') {
      if (!apiKey) {
        throw new Error('Anthropic API key is missing from the Secure Vault.');
      }
      return await callAnthropic(apiKey, modelName, messages, 0.7);
    } else {
      // OpenAI, OpenRouter, Ollama, LMStudio
      if (!apiKey && !endpoint.includes('localhost')) {
        throw new Error(`${selectedProvider} API key is missing from the Secure Vault.`);
      }
      return await callOpenAICompatible(endpoint, apiKey, modelName, messages, 0.7);
    }
  } catch (error) {
    console.error(`Error in getOrchestratorChatResponse with ${selectedProvider}:`, error);
    throw new Error(`Failed to get a response from the orchestrator AI (${selectedProvider}).`);
  }
};


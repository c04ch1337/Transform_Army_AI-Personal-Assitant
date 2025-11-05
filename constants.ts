import { AgentManifest, AgentTeamManifest, OrchestratorManifest } from './types';
import * as AgentManifests from './agents';
import * as Manifests from './manifests';

// Create a lookup map for all individual agent manifests by their ID
const allAgents: { [id: string]: AgentManifest } = {};
Object.values(AgentManifests).forEach(manifest => {
  allAgents[manifest.id] = manifest;
});

// Create a list of all team manifests
const ALL_TEAM_MANIFESTS: AgentTeamManifest[] = [
  Manifests.CAREER_PATHFINDER_TEAM,
  Manifests.PERSONAL_BRANDING_TEAM,
  Manifests.WELLNESS_SCHEDULING_TEAM,
  Manifests.SOCIAL_MEDIA_TEAM,
  Manifests.FINANCIAL_ANALYST_TEAM,
];

const ORACLE_ORCHESTRATOR: OrchestratorManifest = Manifests.ORACLE_ORCHESTRATOR;

const MISSIONS: { [key: string]: string[] } = {
  "Career Pathfinder AI": ["Find part-time or full-time roles for [Job Title] in [City, State]", "Tailor resume for a [Job Title] position", "Identify 5 key recruiters in my selected industry", "Post a list of 5 relevant job openings to the #jobs channel"],
  "Personal Branding Unit": ["Update LinkedIn profile with a new summary and skills", "Schedule 3 relevant industry articles to post this week", "Create a professional branding statement"],
  "Wellness & Scheduling Wing": ["Organize next week's calendar with all standing appointments", "Set daily reminders for hydration and short walks", "Compile a list of top-rated local yoga studios"],
  "Social Media Strike Force": ["Launch a 3-day viral campaign for a new product on TikTok", "Increase Facebook page engagement by 15% this month", "Curate and post a 7-day Instagram story series", "Generate a campaign summary and post it to the #marketing Slack channel"],
  "Financial Analyst Team": ["Analyze the Q2 performance of [Stock Ticker]", "Assess the investment risk of a portfolio of tech stocks", "Create a savings plan to reach [Financial Goal]"],
};

const PROVIDERS: { [key: string]: string[] } = {
  "OpenAI": ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"],
  "Anthropic": ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229", "claude-3-sonnet-20240229"],
  "OpenRouter": [
    "openai/gpt-4o",
    "openai/gpt-4o-mini",
    "anthropic/claude-3.5-sonnet",
    "anthropic/claude-3-opus",
    "meta-llama/llama-3-70b-instruct",
    "mistralai/mistral-7b-instruct",
    "google/gemini-pro"
  ],
  "Ollama": ["llama3", "llama3.1", "mistral", "neural-chat", "codellama"],
  "LMStudio": ["llama-3.1-8b-instruct-q4_k_m", "mistral-7b-instruct-v0.2", "phi-3-mini-4k-instruct"],
  "Local LLM": ["custom-model"], // Custom endpoint for any local LLM server
};

const INDUSTRIES: string[] = [
  "Technology",
  "Healthcare",
  "Finance",
  "Creative & Arts",
  "Retail & E-commerce",
  "Education",
  "Real Estate",
  "Hospitality",
  "Legal",
];


export { MISSIONS, PROVIDERS, INDUSTRIES, ALL_TEAM_MANIFESTS, allAgents, Manifests, ORACLE_ORCHESTRATOR };
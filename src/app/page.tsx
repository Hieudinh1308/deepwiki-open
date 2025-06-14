'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FaWikipediaW, FaGithub, FaGitlab, FaBitbucket, FaCoffee, FaTwitter} from 'react-icons/fa';
import ThemeToggle from '@/components/theme-toggle';
import Mermaid from '../components/Mermaid';

import { useLanguage } from '@/contexts/LanguageContext';

// Define the demo mermaid charts outside the component
const DEMO_FLOW_CHART = `graph TD
  A[Code Repository] --> B[DeepWiki]
  B --> C[Architecture Diagrams]
  B --> D[Component Relationships]
  B --> E[Data Flow]
  B --> F[Process Workflows]

  style A fill:#f9d3a9,stroke:#d86c1f
  style B fill:#d4a9f9,stroke:#6c1fd8
  style C fill:#a9f9d3,stroke:#1fd86c
  style D fill:#a9d3f9,stroke:#1f6cd8
  style E fill:#f9a9d3,stroke:#d81f6c
  style F fill:#d3f9a9,stroke:#6cd81f`;

const DEMO_SEQUENCE_CHART = `sequenceDiagram
  participant User
  participant DeepWiki
  participant GitHub

  User->>DeepWiki: Enter repository URL
  DeepWiki->>GitHub: Request repository data
  GitHub-->>DeepWiki: Return repository data
  DeepWiki->>DeepWiki: Process and analyze code
  DeepWiki-->>User: Display wiki with diagrams

  %% Add a note to make text more visible
  Note over User,GitHub: DeepWiki supports sequence diagrams for visualizing interactions`;

export default function Home() {
  const router = useRouter();
  const { language, setLanguage, messages } = useLanguage();

  // Create a simple translation function
  const t = (key: string, params: Record<string, string | number> = {}): string => {
    // Split the key by dots to access nested properties
    const keys = key.split('.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let value: any = messages;

    // Navigate through the nested properties
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // Return the key if the translation is not found
        return key;
      }
    }

    // If the value is a string, replace parameters
    if (typeof value === 'string') {
      return Object.entries(params).reduce((acc: string, [paramKey, paramValue]) => {
        return acc.replace(`{${paramKey}}`, String(paramValue));
      }, value);
    }

    // Return the key if the value is not a string
    return key;
  };

  const [repositoryInput, setRepositoryInput] = useState('https://github.com/AsyncFuncAI/deepwiki-open');
  const [showTokenInputs, setShowTokenInputs] = useState(false);
  const [localOllama, setLocalOllama] = useState(false);
  const [useOpenRouter, setUseOpenRouter] = useState(false);
  const [openRouterModel, setOpenRouterModel] = useState('openai/gpt-4o');
  const [selectedPlatform, setSelectedPlatform] = useState<'github' | 'gitlab' | 'bitbucket'>('github');
  const [accessToken, setAccessToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>(language);

  // Sync the language context with the selectedLanguage state
  useEffect(() => {
    setLanguage(selectedLanguage);
  }, [selectedLanguage, setLanguage]);

  // Parse repository URL/input and extract owner and repo
  const parseRepositoryInput = (input: string): { owner: string, repo: string, type: string, fullPath?: string, localPath?: string } | null => {
    input = input.trim();

    let owner = '', repo = '', type = 'github', fullPath;
    let localPath: string | undefined;

    // Handle Windows absolute paths (e.g., C:\path\to\folder)
    const windowsPathRegex = /^[a-zA-Z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]*$/;
    if (windowsPathRegex.test(input)) {
      type = 'local';
      localPath = input;
      repo = input.split('\\').pop() || 'local-repo';
      owner = 'local';
    }
    // Handle Unix/Linux absolute paths (e.g., /path/to/folder)
    else if (input.startsWith('/')) {
      type = 'local';
      localPath = input;
      repo = input.split('/').filter(Boolean).pop() || 'local-repo';
      owner = 'local';
    }
    // Handle GitHub URL format
    else if (input.startsWith('https://github.com/')) {
      type = 'github';
      const parts = input.replace('https://github.com/', '').split('/');
      owner = parts[0] || '';
      repo = parts[1] || '';
    }
    // Handle GitLab URL format
    else if (input.startsWith('https://gitlab.com/')) {
      type = 'gitlab';
      const parts = input.replace('https://gitlab.com/', '').split('/');

      // GitLab can have nested groups, so the repo is the last part
      // and the owner/group is everything before that
      if (parts.length >= 2) {
        repo = parts[parts.length - 1] || '';
        owner = parts[0] || '';

        // For GitLab, we also need to keep track of the full path for API calls
        fullPath = parts.join('/');
      }
    }
    // Handle Bitbucket URL format
    else if (input.startsWith('https://bitbucket.org/')) {
      type = 'bitbucket';
      const parts = input.replace('https://bitbucket.org/', '').split('/');
      owner = parts[0] || '';
      repo = parts[1] || '';
    }
    // Handle owner/repo format (assume GitHub by default)
    else {
      const parts = input.split('/');
      owner = parts[0] || '';
      repo = parts[1] || '';
    }

    // Clean values
    owner = owner.trim();
    repo = repo.trim();

    // Remove .git suffix if present
    if (repo.endsWith('.git')) {
      repo = repo.slice(0, -4);
    }

    if (!owner || !repo) {
      return null;
    }

    return { owner, repo, type, fullPath, localPath };
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent multiple submissions
    if (isSubmitting) {
      console.log('Form submission already in progress, ignoring duplicate click');
      return;
    }

    setIsSubmitting(true);

    // Parse repository input
    const parsedRepo = parseRepositoryInput(repositoryInput);

    if (!parsedRepo) {
      setError('Invalid repository format. Use "owner/repo", GitHub/GitLab/BitBucket URL, or a local folder path like "/path/to/folder" or "C:\\path\\to\\folder".');
      setIsSubmitting(false);
      return;
    }

    const { owner, repo, type, localPath } = parsedRepo;

    // Store tokens in query params if they exist
    const params = new URLSearchParams();
    if (accessToken) {
      if (selectedPlatform === 'github') {
        params.append('github_token', accessToken);
      } else if (selectedPlatform === 'gitlab') {
        params.append('gitlab_token', accessToken);
      } else if (selectedPlatform === 'bitbucket') {
        params.append('bitbucket_token', accessToken);
      }
    }
    // Always include the type parameter
    params.append('type', type);
    // Add local path if it exists
    if (localPath) {
      params.append('local_path', encodeURIComponent(localPath));
    }
    // Add model parameters
    params.append('local_ollama', localOllama.toString());
    params.append('use_openrouter', useOpenRouter.toString());
    if (useOpenRouter) {
      params.append('openrouter_model', openRouterModel);
    }

    // Add language parameter
    params.append('language', selectedLanguage);

    const queryString = params.toString() ? `?${params.toString()}` : '';

    // Navigate to the dynamic route
    router.push(`/${owner}/${repo}${queryString}`);

    // The isSubmitting state will be reset when the component unmounts during navigation
  };

  return (
    <div className="h-screen paper-texture p-4 md:p-8 flex flex-col">
      <header className="max-w-6xl mx-auto mb-6 h-fit w-full">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-[var(--card-bg)] rounded-lg shadow-custom border border-[var(--border-color)] p-4">
          <div className="flex items-center">
            <div className="bg-[var(--accent-primary)] p-2 rounded-lg mr-3">
              <FaWikipediaW className="text-2xl text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-[var(--accent-primary)]">{t('common.appName')}</h1>
              <p className="text-xs text-[var(--muted)]">{t('common.tagline')}</p>
            </div>
          </div>

          <form onSubmit={handleFormSubmit} className="flex flex-col gap-3 w-full max-w-3xl">
            {/* Repository URL input and submit button */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={repositoryInput}
                  onChange={(e) => setRepositoryInput(e.target.value)}
                  placeholder={t('form.repoPlaceholder') || "owner/repo, GitHub/GitLab/BitBucket URL, or local folder path"}
                  className="input-japanese block w-full pl-10 pr-3 py-2.5 border-[var(--border-color)] rounded-lg bg-transparent text-[var(--foreground)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
                {error && (
                  <div className="text-[var(--highlight)] text-xs mt-1">
                    {error}
                  </div>
                )}
              </div>
              <button
                type="submit"
                className="btn-japanese px-6 py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isSubmitting}
              >
                {isSubmitting ? t('common.processing') : t('common.generateWiki')}
              </button>
            </div>

            {/* Advanced options section with improved layout */}
            <div className="flex flex-wrap gap-4 items-start bg-[var(--card-bg)]/80 p-4 rounded-lg border border-[var(--border-color)] shadow-sm">
              {/* Language selection */}
              <div className="min-w-[140px]">
                <label htmlFor="language-select" className="block text-xs font-medium text-[var(--foreground)] mb-1.5">
                  {t('form.wikiLanguage')}
                </label>
                <select
                  id="language-select"
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="input-japanese block w-full px-2.5 py-1.5 text-sm rounded-md bg-transparent text-[var(--foreground)] focus:outline-none focus:border-[var(--accent-primary)]"
                >
                  <option value="en">English</option>
                  <option value="ja">Japanese (日本語)</option>
                  <option value="zh">Mandarin (中文)</option>
                  <option value="es">Spanish (Español)</option>
                  <option value="kr">Korean (한국어)</option>
                  <option value="vi">Vietnamese (Tiếng Việt)</option>
                </select>
              </div>

              {/* Model options */}
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-[var(--foreground)] mb-1.5">
                  {t('form.modelOptions')}
                </label>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <input
                      id="local-ollama"
                      type="checkbox"
                      checked={localOllama}
                      onChange={(e) => {
                        setLocalOllama(e.target.checked);
                        if (e.target.checked) {
                          setUseOpenRouter(false);
                        }
                      }}
                      className="h-4 w-4 rounded border-[var(--border-color)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)]"
                    />
                    <label htmlFor="local-ollama" className="ml-2 text-sm text-[var(--foreground)]">
                      {t('form.localOllama')} <span className="text-xs text-[var(--muted)]">({t('form.experimental')})</span>
                    </label>
                  </div>

                  <div className="flex items-center">
                    <input
                      id="use-openrouter"
                      type="checkbox"
                      checked={useOpenRouter}
                      onChange={(e) => {
                        setUseOpenRouter(e.target.checked);
                        if (e.target.checked) {
                          setLocalOllama(false);
                        }
                      }}
                      className="h-4 w-4 rounded border-[var(--border-color)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)]"
                    />
                    <label htmlFor="use-openrouter" className="ml-2 text-sm text-[var(--foreground)]">
                      {t('form.useOpenRouter')}
                    </label>
                  </div>
                </div>
              </div>

              {/* OpenRouter model selection - only shown when OpenRouter is selected */}
              {useOpenRouter && (
                <div className="w-full">
                  <label htmlFor="openrouter-model" className="block text-xs font-medium text-[var(--foreground)] mb-1.5">
                    {t('form.openRouterModel')}
                  </label>
                  <select
                    id="openrouter-model"
                    value={openRouterModel}
                    onChange={(e) => setOpenRouterModel(e.target.value)}
                    className="input-japanese block w-full px-2.5 py-1.5 text-sm rounded-md bg-transparent text-[var(--foreground)] focus:outline-none focus:border-[var(--accent-primary)]"
                  >
                    <option value="openai/gpt-4o">OpenAI GPT-4.0</option>
                    <option value="openai/gpt-4.1">OpenAI GPT-4.1</option>
                    <option value="openai/o1">OpenAI o1</option>
                    <option value="openai/o1-mini">OpenAI o1-mini</option>
                    <option value="anthropic/claude-3-5-sonnet">Anthropic Claude 3.5 Sonnet</option>
                    <option value="anthropic/claude-3-7-sonnet">Anthropic Claude 3.7 Sonnet</option>
                    <option value="google/gemini-2.0-flash-001">Google Gemini 2.0 Flash</option>
                    <option value="meta-llama/llama-3-70b-instruct">Meta Llama 3 70B Instruct</option>
                    <option value="mistralai/mixtral-8x22b-instruct">Mistral Mixtral 8x22B Instruct</option>
                  </select>
                </div>
              )}
            </div>

            {/* Access tokens button */}
            <div className="flex items-center relative">
              <button
                type="button"
                onClick={() => setShowTokenInputs(!showTokenInputs)}
                className="text-sm text-[var(--accent-primary)] hover:text-[var(--highlight)] flex items-center transition-colors border-b border-[var(--border-color)] hover:border-[var(--accent-primary)] pb-0.5"
              >
                {showTokenInputs ? t('form.hideTokens') : t('form.addTokens')}
              </button>
              {showTokenInputs && (
                <>
                  <div className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40" onClick={() => setShowTokenInputs(false)} />
                  <div className="absolute left-0 right-0 top-full mt-2 z-50">
                    <div className="flex flex-col gap-3 p-4 bg-[var(--card-bg)] rounded-lg border border-[var(--border-color)] shadow-custom card-japanese">
                      <div className="flex justify-between items-center">
                        <h3 className="text-sm font-medium text-[var(--foreground)]">{t('form.accessToken')}</h3>
                        <button
                          type="button"
                          onClick={() => setShowTokenInputs(false)}
                          className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                        >
                          <span className="sr-only">Close</span>
                          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>

                      <div className="bg-[var(--background)]/50 p-3 rounded-md border border-[var(--border-color)]">
                        <label className="block text-xs font-medium text-[var(--foreground)] mb-2">
                          {t('form.selectPlatform')}
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedPlatform('github')}
                            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border transition-all ${
                              selectedPlatform === 'github'
                                ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)] text-[var(--accent-primary)] shadow-sm'
                                : 'border-[var(--border-color)] text-[var(--foreground)] hover:bg-[var(--background)]'
                            }`}
                          >
                            <FaGithub className="text-lg" />
                            <span className="text-sm">GitHub</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedPlatform('gitlab')}
                            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border transition-all ${
                              selectedPlatform === 'gitlab'
                                ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)] text-[var(--accent-primary)] shadow-sm'
                                : 'border-[var(--border-color)] text-[var(--foreground)] hover:bg-[var(--background)]'
                            }`}
                          >
                            <FaGitlab className="text-lg" />
                            <span className="text-sm">GitLab</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedPlatform('bitbucket')}
                            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border transition-all ${
                              selectedPlatform === 'bitbucket'
                                ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)] text-[var(--accent-primary)] shadow-sm'
                                : 'border-[var(--border-color)] text-[var(--foreground)] hover:bg-[var(--background)]'
                            }`}
                          >
                            <FaBitbucket className="text-lg" />
                            <span className="text-sm">Bitbucket</span>
                          </button>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="access-token" className="block text-xs font-medium text-[var(--foreground)] mb-2">
                          {t('form.personalAccessToken', { platform: selectedPlatform.charAt(0).toUpperCase() + selectedPlatform.slice(1) })}
                        </label>
                        <input
                          id="access-token"
                          type="password"
                          value={accessToken}
                          onChange={(e) => setAccessToken(e.target.value)}
                          placeholder={t('form.tokenPlaceholder', { platform: selectedPlatform })}
                          className="input-japanese block w-full px-3 py-2 rounded-md bg-transparent text-[var(--foreground)] focus:outline-none focus:border-[var(--accent-primary)] text-sm"
                        />
                        <div className="flex items-center mt-2 text-xs text-[var(--muted)]">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {t('form.tokenSecurityNote')}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </form>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full overflow-y-auto">
        <div className="min-h-full flex flex-col items-center p-8 pt-10 bg-[var(--card-bg)] rounded-lg shadow-custom card-japanese">
          {/* Header section */}
          <div className="flex flex-col items-center w-full max-w-2xl mb-8">
            <div className="flex flex-col sm:flex-row items-center mb-6 gap-4">
              <div className="relative">
                <div className="absolute -inset-1 bg-[var(--accent-primary)]/20 rounded-full blur-md"></div>
                <FaWikipediaW className="text-5xl text-[var(--accent-primary)] relative z-10" />
              </div>
              <div className="text-center sm:text-left">
                <h2 className="text-2xl font-bold text-[var(--foreground)] font-serif mb-1">{t('home.welcome')}</h2>
                <p className="text-[var(--accent-primary)] text-sm max-w-md">{t('home.welcomeTagline')}</p>
              </div>
            </div>

            <p className="text-[var(--foreground)] text-center mb-8 text-lg leading-relaxed">
              {t('home.description')}
            </p>
          </div>

          {/* Quick Start section - redesigned for better spacing */}
          <div className="w-full max-w-2xl mb-10 bg-[var(--accent-primary)]/5 border border-[var(--accent-primary)]/20 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-[var(--accent-primary)] mb-3 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t('home.quickStart')}
            </h3>
            <p className="text-sm text-[var(--foreground)] mb-3">{t('home.enterRepoUrl')}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-[var(--muted)]">
              <div className="bg-[var(--background)]/70 p-3 rounded border border-[var(--border-color)] font-mono overflow-x-hidden whitespace-nowrap"
              >https://github.com/AsyncFuncAI/deepwiki-open</div>
              <div className="bg-[var(--background)]/70 p-3 rounded border border-[var(--border-color)] font-mono overflow-x-hidden whitespace-nowrap"
              >https://gitlab.com/gitlab-org/gitlab</div>
              <div className="bg-[var(--background)]/70 p-3 rounded border border-[var(--border-color)] font-mono overflow-x-hidden whitespace-nowrap"
              >AsyncFuncAI/deepwiki-open</div>
              <div className="bg-[var(--background)]/70 p-3 rounded border border-[var(--border-color)] font-mono overflow-x-hidden whitespace-nowrap"
              >https://bitbucket.org/atlassian/atlaskit</div>
            </div>
          </div>

          {/* Visualization section - improved for better visibility */}
          <div className="w-full max-w-2xl mb-8 bg-[var(--background)]/70 rounded-lg p-6 border border-[var(--border-color)]">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[var(--accent-primary)] flex-shrink-0 mt-0.5 sm:mt-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <h3 className="text-base font-semibold text-[var(--foreground)] font-serif">{t('home.advancedVisualization')}</h3>
            </div>
            <p className="text-sm text-[var(--foreground)] mb-5 leading-relaxed">
              {t('home.diagramDescription')}
            </p>

            {/* Diagrams with improved layout */}
            <div className="grid grid-cols-1 gap-6">
              <div className="bg-[var(--card-bg)] p-4 rounded-lg border border-[var(--border-color)] shadow-custom">
                <h4 className="text-sm font-medium text-[var(--foreground)] mb-3 font-serif">{t('home.flowDiagram')}</h4>
                <Mermaid chart={DEMO_FLOW_CHART} />
              </div>

              <div className="bg-[var(--card-bg)] p-4 rounded-lg border border-[var(--border-color)] shadow-custom">
                <h4 className="text-sm font-medium text-[var(--foreground)] mb-3 font-serif">{t('home.sequenceDiagram')}</h4>
                <Mermaid chart={DEMO_SEQUENCE_CHART} />
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="max-w-6xl mx-auto mt-8 flex flex-col gap-4 w-full">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-[var(--card-bg)] rounded-lg p-4 border border-[var(--border-color)] shadow-custom">
          <p className="text-[var(--muted)] text-sm font-serif">{t('footer.copyright')}</p>

          <div className="flex items-center gap-6">
            <div className="flex items-center space-x-5">
              <a href="https://github.com/AsyncFuncAI/deepwiki-open" target="_blank" rel="noopener noreferrer"
                className="text-[var(--muted)] hover:text-[var(--accent-primary)] transition-colors">
                <FaGithub className="text-xl" />
              </a>
              <a href="https://buymeacoffee.com/sheing" target="_blank" rel="noopener noreferrer"
                className="text-[var(--muted)] hover:text-[var(--accent-primary)] transition-colors">
                <FaCoffee className="text-xl" />
              </a>
              <a href="https://x.com/sashimikun_void" target="_blank" rel="noopener noreferrer"
                className="text-[var(--muted)] hover:text-[var(--accent-primary)] transition-colors">
                <FaTwitter className="text-xl" />
              </a>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </footer>
    </div>
  );
}
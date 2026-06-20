'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AppShell } from '@/components/shell';
import { Loader2, AlertTriangle, Sparkles } from 'lucide-react';

interface InferenceModel {
  id: string;
  target: string;
  modelId: string;
  ownedBy: string;
}

interface ChatResponse {
  content: string;
  model: string;
  usage: unknown;
  via: 'chat' | 'messages';
}

export default function LLMPage() {
  const [models, setModels] = useState<InferenceModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<ChatResponse | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);

  // Fetch available models on mount
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch('/api/inference/models');
        if (!res.ok) {
          throw new Error(`Failed to fetch models (${res.status})`);
        }
        const data = await res.json();
        setModels(Array.isArray(data.models) ? data.models : []);
        if (data.models && data.models.length > 0) {
          setSelectedModel(data.models[0].id);
        }
        setModelsError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setModelsError(message);
        console.error('Failed to load models:', error);
      } finally {
        setIsLoadingModels(false);
      }
    };

    fetchModels();
  }, []);

  // Group models by target
  const modelsByTarget = useMemo(() => {
    const groups: Record<string, InferenceModel[]> = {};
    for (const model of models) {
      if (!groups[model.target]) {
        groups[model.target] = [];
      }
      groups[model.target].push(model);
    }
    return groups;
  }, [models]);

  const summary = useMemo(() => {
    const targetCount = Object.keys(modelsByTarget).length;
    const modelCount = models.length;
    return { targetCount, modelCount };
  }, [models, modelsByTarget]);

  const handleSend = async () => {
    if (!selectedModel || !prompt.trim()) {
      return;
    }

    setIsExecuting(true);
    setResult(null);
    setResultError(null);

    try {
      const res = await fetch('/api/inference/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          prompt: prompt.trim(),
          maxTokens: 1024,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.details || data.error || `Request failed (${res.status})`);
      }

      const data = await res.json();
      setResult(data);
      setResultError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setResultError(message);
      console.error('Failed to call inference:', error);
    } finally {
      setIsExecuting(false);
    }
  };

  const usageText =
    result && result.usage
      ? (() => {
          const u = result.usage as Record<string, unknown>;
          const parts = [];
          if (u.input_tokens) parts.push(`입력 ${u.input_tokens}`);
          if (u.output_tokens) parts.push(`출력 ${u.output_tokens}`);
          if (u.prompt_tokens) parts.push(`프롬프트 ${u.prompt_tokens}`);
          if (u.completion_tokens) parts.push(`완성 ${u.completion_tokens}`);
          return parts.join(' · ');
        })()
      : '';

  return (
    <AppShell
      title="LLM Gateway"
      description="추론 타깃을 통한 LLM 라우팅"
      icon={Sparkles}
    >
      <div className="space-y-6">
        {/* Summary Card */}
        {!isLoadingModels && !modelsError && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">추론 타깃</CardTitle>
              <CardDescription>
                {summary.targetCount} 타깃 · {summary.modelCount} 모델
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {Object.entries(modelsByTarget).map(([target, targetModels]) => (
                  <div key={target} className="text-muted-foreground">
                    <span className="font-medium">{target}:</span> {targetModels.length} 모델
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Models Error */}
        {modelsError && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                모델 로드 오류
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{modelsError}</p>
            </CardContent>
          </Card>
        )}

        {/* Input Card */}
        {!modelsError && (
          <Card>
            <CardHeader>
              <CardTitle>채팅</CardTitle>
              <CardDescription>모델을 선택하고 프롬프트를 입력합니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingModels ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="model">모델</Label>
                    <select
                      id="model"
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {models.map((model) => (
                        <option key={model.id} value={model.id} className="bg-popover text-popover-foreground">
                          {model.id}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="prompt">프롬프트</Label>
                    <Textarea
                      id="prompt"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="프롬프트를 입력합니다..."
                      className="min-h-[120px] resize-none"
                      disabled={isExecuting}
                    />
                  </div>

                  <Button
                    onClick={handleSend}
                    disabled={isExecuting || !selectedModel || !prompt.trim()}
                    className="w-full"
                  >
                    {isExecuting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        처리 중...
                      </>
                    ) : (
                      '보내기'
                    )}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Result Card */}
        {result && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">응답</CardTitle>
              <CardDescription>
                {result.model} · {result.via === 'chat' ? 'Chat API' : 'Messages API'}
                {usageText && ` · ${usageText}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap rounded-md bg-muted p-4 text-sm leading-relaxed text-foreground">
                {result.content}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Result Error */}
        {resultError && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                오류
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{resultError}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AppShell } from '@/components/shell';
import { Loader2, Wrench, ChevronDown, ChevronUp, Play, FormInput, Code2 } from 'lucide-react';
import JsonView from '@uiw/react-json-view';
import { SchemaForm, isFullyRenderable } from '@/components/schema-form';

export default function InspectorPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [toolsResult, setToolsResult] = useState<any>(null);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [selectedSchema, setSelectedSchema] = useState<any>(null);
  const [toolInput, setToolInput] = useState('{}');
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [inputMode, setInputMode] = useState<'form' | 'json'>('form');
  const [toolResult, setToolResult] = useState<any>(null);
  const [executing, setExecuting] = useState(false);

  const handleLoadTools = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/mcp/list');
      const data = await response.json();
      setToolsResult(data);
    } catch (error) {
      console.error('Failed to load tools:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Build a starter input object from a tool's JSON schema so the operator
  // doesn't have to author it from scratch. Prefills `default` values when
  // the schema provides them; otherwise leaves fields empty.
  const objectFromSchema = (schema: any): Record<string, unknown> => {
    const props = schema?.properties ?? {};
    const obj: Record<string, unknown> = {};
    for (const key of Object.keys(props)) {
      if (props[key]?.default !== undefined) obj[key] = props[key].default;
    }
    return obj;
  };

  const selectTool = (tool: any) => {
    const schema = tool.inputSchema ?? null;
    const seed = objectFromSchema(schema);
    setSelectedTool(tool.name);
    setSelectedSchema(schema);
    setFormValues(seed);
    setToolInput(JSON.stringify(seed, null, 2));
    // Prefer the friendly form when every field is renderable; otherwise the
    // operator needs the raw JSON editor.
    setInputMode(isFullyRenderable(schema) ? 'form' : 'json');
    setToolResult(null);
    toggleTool(tool.name);
  };

  // Keep form and JSON views in sync when the operator edits the form.
  const handleFormChange = (next: Record<string, unknown>) => {
    setFormValues(next);
    setToolInput(JSON.stringify(next, null, 2));
  };

  // When switching modes, carry edits across. JSON -> form parses the text;
  // form -> JSON re-serializes the current values.
  const switchMode = (mode: 'form' | 'json') => {
    if (mode === inputMode) return;
    if (mode === 'form') {
      try {
        const parsed = JSON.parse(toolInput);
        if (parsed && typeof parsed === 'object') setFormValues(parsed);
      } catch {
        // Keep the last good form values if the JSON is currently invalid.
      }
    } else {
      setToolInput(JSON.stringify(formValues, null, 2));
    }
    setInputMode(mode);
  };

  const handleExecuteTool = async () => {
    if (!selectedTool) return;

    setExecuting(true);
    try {
      // In form mode the structured values are the source of truth; in JSON
      // mode we parse the raw editor text.
      const input = inputMode === 'form' ? formValues : JSON.parse(toolInput);
      const response = await fetch('/api/mcp/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: selectedTool,
          input,
        }),
      });
      const data = await response.json();
      setToolResult(data);
    } catch (error) {
      console.error('Failed to execute tool:', error);
      setToolResult({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      setExecuting(false);
    }
  };

  const toggleTool = (toolName: string) => {
    const newExpanded = new Set(expandedTools);
    if (newExpanded.has(toolName)) {
      newExpanded.delete(toolName);
    } else {
      newExpanded.add(toolName);
    }
    setExpandedTools(newExpanded);
  };

  return (
    <AppShell
      title="MCP Inspector"
      description="게이트웨이의 MCP 도구를 점검하고 테스트"
      icon={Wrench}
    >
      <div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Tools List */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>사용 가능한 도구</CardTitle>
                <CardDescription>게이트웨이에서 제공하는 도구</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button onClick={handleLoadTools} disabled={isLoading} className="w-full">
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      불러오는 중...
                    </>
                  ) : (
                    <>
                      <Wrench className="mr-2 h-4 w-4" />
                      도구 불러오기
                    </>
                  )}
                </Button>

                {toolsResult && (
                  <div className="space-y-2 max-h-[48rem] overflow-y-auto">
                    {Array.isArray(toolsResult.tools) ? (
                      toolsResult.tools.map((tool: any) => (
                        <button
                          key={tool.name}
                          onClick={() => selectTool(tool)}
                          className="w-full text-left p-2 rounded hover:bg-accent border border-input"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-sm truncate">{tool.name}</span>
                            {expandedTools.has(tool.name) ? (
                              <ChevronUp className="h-4 w-4 shrink-0" />
                            ) : (
                              <ChevronDown className="h-4 w-4 shrink-0" />
                            )}
                          </div>
                          {tool.description && (
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                              {tool.description}
                            </p>
                          )}
                        </button>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">사용 가능한 도구가 없습니다</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Tool Editor */}
          <div className="lg:col-span-2 space-y-4">
            {selectedTool && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="break-all">도구 테스트: {selectedTool}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>입력</Label>
                        {/* Form is the friendly default; JSON mode is the escape
                            hatch for power users and unrenderable schemas. */}
                        <div className="inline-flex rounded-md border border-input p-0.5">
                          <button
                            type="button"
                            onClick={() => switchMode('form')}
                            className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                              inputMode === 'form'
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            <FormInput className="h-3.5 w-3.5" />
                            폼
                          </button>
                          <button
                            type="button"
                            onClick={() => switchMode('json')}
                            className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                              inputMode === 'json'
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            <Code2 className="h-3.5 w-3.5" />
                            JSON
                          </button>
                        </div>
                      </div>

                      {inputMode === 'form' ? (
                        <div className="rounded-md border border-input p-4">
                          <SchemaForm
                            schema={selectedSchema}
                            value={formValues}
                            onChange={handleFormChange}
                          />
                        </div>
                      ) : (
                        <Textarea
                          id="tool-input"
                          value={toolInput}
                          onChange={(e) => setToolInput(e.target.value)}
                          className="font-mono text-sm"
                          rows={8}
                        />
                      )}
                    </div>

                    {selectedSchema && (
                      <details className="group">
                        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                          입력 스키마 보기
                        </summary>
                        <div className="mt-2 bg-muted/50 rounded p-3 overflow-auto max-h-48">
                          <JsonView value={selectedSchema} className="text-sm !bg-transparent" collapsed={2} />
                        </div>
                      </details>
                    )}
                    <Button onClick={handleExecuteTool} disabled={executing} className="w-full">
                      {executing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          실행 중...
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 h-4 w-4" />
                          실행
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {toolResult && (
                  <Card>
                    <CardHeader>
                      <CardTitle>결과</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-auto max-h-96 bg-muted/50 rounded p-3">
                        <JsonView
                          value={toolResult}
                          className="text-sm !bg-transparent"
                          collapsed={2}
                        />
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

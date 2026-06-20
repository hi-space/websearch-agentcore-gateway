# Container image for the browser_task Lambda.
#
# browser-use + playwright + transitive deps exceed the Lambda zip limit
# (250 MB unzipped), so this tool ships as a container image instead. The
# handler drives a *remote* AgentCore Browser over CDP, so no local Chromium
# binary is bundled — only the Python libraries are needed.
#
# Build context is the tools/ root so _shared is available alongside the
# browser handler (mirrors the zip build layout).
# Multi-arch tag; the build's --platform flag selects amd64 vs arm64 to match
# the Lambda architecture (see module var.architecture).
FROM public.ecr.aws/lambda/python:3.12

# Dependencies first for layer caching.
COPY browser/requirements.txt ${LAMBDA_TASK_ROOT}/requirements.txt
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

# Handler + shared helpers (same layout the zip build produces).
COPY browser/handler.py ${LAMBDA_TASK_ROOT}/handler.py
COPY _shared/ ${LAMBDA_TASK_ROOT}/_shared/

CMD ["handler.lambda_handler"]

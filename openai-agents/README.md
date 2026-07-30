# TITMAS OpenAI Agents SDK Adapter

Pinned baseline: `openai-agents==0.19.1`.

```bash
python3.13 -m venv .venv
.venv/bin/pip install -e ../sdk/python
.venv/bin/pip install -e .
```

`build_titmas_tools(client)` returns bounded function tools. It does not create
an Agent, run a model, or grant an Agent access.

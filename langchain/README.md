# TITMAS LangChain Adapter

Pinned baseline: `langchain==1.3.14`.

```bash
python3.13 -m venv .venv
.venv/bin/pip install -e ../sdk/python
.venv/bin/pip install -e .
```

`build_titmas_tools(client)` returns preflight, Receipt verification and quota
tools. Tool descriptions preserve `NOT_ASSESSED` and the non-authoritative
Receipt boundary.

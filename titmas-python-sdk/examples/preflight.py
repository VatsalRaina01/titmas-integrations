from __future__ import annotations

import os

from titmas_agent_sdk import TitmasClient


def main() -> None:
    with TitmasClient(
        credential=os.environ["TITMAS_CREDENTIAL"],
        credential_id=os.environ["TITMAS_CREDENTIAL_ID"],
    ) as client:
        print(client.capabilities())
        result = client.preflight(
            request_id="example-request-001",
            idempotency_key="example-request-001-attempt-1",
            tenant_id=os.environ["TITMAS_TENANT_ID"],
            agent_identity=os.environ["TITMAS_AGENT_ID"],
            schema_id="entity-object",
            schema_version="v0.1",
            object_digest="0" * 64,
            object_value={"object_type": "ENTITY", "version": "v0.1"},
        )
        print(result)


if __name__ == "__main__":
    main()

"""Tests for api.py — endpoint structure, validation, and health check using FastAPI TestClient."""

import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from fastapi.testclient import TestClient
from api import app

CLIENT_HEADER = {"X-PipBoy-Client": "pipboy-4000"}


@pytest.fixture
def client():
    return TestClient(app)


class TestHealthEndpoint:

    def test_health_returns_json(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data

    def test_health_reports_status(self, client):
        data = client.get("/api/health").json()
        # Either "ok" (Ollama running) or "error" (not running) — both valid
        assert data["status"] in ("ok", "error")


class TestModelEndpoints:

    def test_get_model(self, client):
        resp = client.get("/api/model")
        assert resp.status_code == 200
        assert "active_model" in resp.json()

    def test_list_models(self, client):
        resp = client.get("/api/models")
        assert resp.status_code == 200
        data = resp.json()
        # Either models list or error (if Ollama offline)
        assert "models" in data or "error" in data

    def test_switch_model_requires_header(self, client):
        resp = client.post("/api/model", json={"model": "test:7b"})
        assert resp.status_code == 403

    def test_switch_model_with_header(self, client):
        resp = client.post(
            "/api/model",
            json={"model": "test:7b"},
            headers=CLIENT_HEADER,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("status") == "ok"
        assert data["active_model"] == "test:7b"

    def test_switch_model_empty_name(self, client):
        resp = client.post(
            "/api/model",
            json={"model": ""},
            headers=CLIENT_HEADER,
        )
        data = resp.json()
        assert "error" in data


class TestChatEndpoint:

    def test_chat_requires_header(self, client):
        resp = client.post("/api/chat", json={"message": "hello"})
        assert resp.status_code == 403

    def test_chat_empty_message(self, client):
        resp = client.post(
            "/api/chat",
            json={"message": ""},
            headers=CLIENT_HEADER,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "error" in data


class TestClearEndpoint:

    def test_clear_requires_header(self, client):
        resp = client.post("/api/clear")
        assert resp.status_code == 403

    def test_clear_with_header(self, client):
        resp = client.post("/api/clear", headers=CLIENT_HEADER)
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


class TestPromptEndpoints:

    def test_get_prompt(self, client):
        resp = client.get("/api/prompt")
        assert resp.status_code == 200
        assert "prompt" in resp.json()

    def test_save_prompt_requires_header(self, client):
        resp = client.post("/api/prompt", json={"prompt": "test"})
        assert resp.status_code == 403

    def test_save_prompt_empty(self, client):
        resp = client.post(
            "/api/prompt",
            json={"prompt": ""},
            headers=CLIENT_HEADER,
        )
        data = resp.json()
        assert "error" in data


class TestConversationEndpoints:

    def test_list_conversations(self, client):
        resp = client.get("/api/conversations")
        assert resp.status_code == 200
        assert "conversations" in resp.json()

    def test_load_conversation_requires_header(self, client):
        resp = client.post(
            "/api/conversations/load",
            json={"session_id": "nonexistent"},
        )
        assert resp.status_code == 403

    def test_load_nonexistent_conversation(self, client):
        resp = client.post(
            "/api/conversations/load",
            json={"session_id": "nonexistent"},
            headers=CLIENT_HEADER,
        )
        data = resp.json()
        assert "error" in data


class TestSetupEndpoints:

    def test_setup_status_returns_json(self, client):
        resp = client.get("/api/setup/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data
        assert data["status"] in ("not_installed", "not_running", "no_models", "ready")

    def test_setup_status_includes_recommended_models(self, client):
        resp = client.get("/api/setup/status")
        data = resp.json()
        assert "recommended_models" in data
        models = data["recommended_models"]
        assert len(models) > 0
        for m in models:
            assert "name" in m
            assert "description" in m
            assert "size" in m

    def test_open_download_requires_header(self, client):
        resp = client.post("/api/setup/open-download")
        assert resp.status_code == 403

    def test_pull_requires_header(self, client):
        resp = client.post("/api/setup/pull", json={"name": "test:latest"})
        assert resp.status_code == 403

    def test_pull_empty_name(self, client):
        resp = client.post(
            "/api/setup/pull",
            json={"name": ""},
            headers=CLIENT_HEADER,
        )
        assert resp.status_code == 400
        assert "error" in resp.json()

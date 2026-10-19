.PHONY: etl check test

etl:
	cd etl && uv run python pipeline.py

check: etl
	cd etl && uv run python validate.py
	uvx ruff format --check etl
	uvx ruff check etl
	cd web && npx biome check .
	./web/node_modules/.bin/biome check schema biome.json

test: etl
	cd etl && uv run pytest -q

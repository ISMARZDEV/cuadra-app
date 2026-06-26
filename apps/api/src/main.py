"""FastAPI app factory. Punto de entrada del backend.

Monta CORS (§12·E E.1), un handler de errores con `ProblemDetailDto` (RFC 7807-ish)
y el router `/v1`. La DI se cablea en `src/api/composition_root.py`.
"""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from src.api.problem_detail import ProblemDetailDto
from src.api.router import api_router
from src.config import settings


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(StarletteHTTPException)
    async def _problem_detail(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        body = ProblemDetailDto(title="error", status=exc.status_code, detail=str(exc.detail))
        return JSONResponse(status_code=exc.status_code, content=body.model_dump())

    app.include_router(api_router, prefix="/v1")
    return app


app = create_app()

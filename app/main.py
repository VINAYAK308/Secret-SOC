from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.config import get_settings
from app.routers import alerts, auth, findings, repositories, scan, users

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="Secret SOC Dashboard", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

app.include_router(auth.router)
app.include_router(findings.router)
app.include_router(scan.router)
app.include_router(repositories.router)
app.include_router(alerts.router)
app.include_router(users.router)


@app.get("/api/health")
async def health():
    return HTMLResponse("SOC Backend Running")


@app.get("/", response_class=HTMLResponse)
@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard_page(request: Request):
    return templates.TemplateResponse(
        "dashboard.html",
        {"request": request, "active_page": "dashboard"},
    )


@app.get("/findings", response_class=HTMLResponse)
async def findings_page(request: Request):
    return templates.TemplateResponse(
        "findings.html",
        {"request": request, "active_page": "findings"},
    )


@app.get("/repositories", response_class=HTMLResponse)
async def repositories_page(request: Request):
    return templates.TemplateResponse(
        "repositories.html",
        {"request": request, "active_page": "repositories"},
    )


@app.get("/scan", response_class=HTMLResponse)
async def scan_page(request: Request):
    return templates.TemplateResponse(
        "trigger_scan.html",
        {"request": request, "active_page": "scan"},
    )


@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse(
        "login.html",
        {"request": request, "show_navbar_brand": True},
    )


@app.get("/alerts", response_class=HTMLResponse)
async def alerts_page(request: Request):
    return templates.TemplateResponse(
        "alerts.html",
        {"request": request, "active_page": "alerts"},
    )


@app.get("/users", response_class=HTMLResponse)
async def users_page(request: Request):
    return templates.TemplateResponse(
        "users.html",
        {"request": request, "active_page": "users"},
    )


def run():
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=False,
    )


if __name__ == "__main__":
    run()

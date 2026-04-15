from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api.routes import router

app = FastAPI(title="ProcViz", version="0.1.0")
app.include_router(router)

DIST_DIR = Path(__file__).parent / "frontend" / "dist"


@app.get("/api/health")
def health():
    return {"status": "ok"}


if DIST_DIR.exists():
    @app.get("/")
    def serve_index():
        return FileResponse(DIST_DIR / "index.html")

    app.mount("/", StaticFiles(directory=DIST_DIR), name="static")


def main():
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)


if __name__ == "__main__":
    main()

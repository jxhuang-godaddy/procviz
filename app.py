from fastapi import FastAPI

app = FastAPI(title="ProcViz", version="0.1.0")


@app.get("/api/health")
def health():
    return {"status": "ok"}


def main():
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)


if __name__ == "__main__":
    main()

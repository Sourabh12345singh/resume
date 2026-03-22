FROM python:3.11-slim

# Must required: keep runtime deterministic and logs visible in containers.
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
	PYTHONUNBUFFERED=1

# Must required: install exact app dependencies before copying source for better layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Must required: copy application code and expose Flask service port.
COPY . .
EXPOSE 5000
# CMD ["python", "app.py"]

# Optional: use production-grade WSGI server for better concurrency and stability.
CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5000", "app:app"]

# Optional: add health check so orchestrators can restart unhealthy containers.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/health', timeout=3)"
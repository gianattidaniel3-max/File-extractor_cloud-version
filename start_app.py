import os
import sys
import subprocess
import threading
import webbrowser
import time
import socket
from pathlib import Path
import tkinter as tk
from tkinter import ttk

BASE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = BASE_DIR / "backend"
VENV_DIR = BASE_DIR / ".venv"
REQUIREMENTS_FILE = BACKEND_DIR / "requirements.txt"
ENV_FILE = BACKEND_DIR / ".env"
FRONTEND_INDEX = BASE_DIR / "frontend" / "index.html"

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def cleanup_port(port):
    """Attempt to kill any process using the specified port (Windows only logic for now)."""
    if os.name != 'nt': return
    try:
        # Find PID using netstat
        output = subprocess.check_output(f"netstat -ano | findstr :{port}", shell=True).decode()
        for line in output.strip().split('\n'):
            parts = line.strip().split()
            if len(parts) >= 5 and parts[1].endswith(f":{port}"):
                pid = parts[-1]
                print(f"[*] Liberando porta {port} (chiusura processo {pid})...")
                subprocess.run(["taskkill", "/F", "/PID", pid], capture_output=True)
    except Exception:
        pass # No process found or kill failed

def create_custom_button(parent, text, bg_color, command):
    btn_frame = tk.Frame(parent, bg=bg_color, cursor="hand2")
    lbl = tk.Label(btn_frame, text=text, bg=bg_color, fg="white", font=("Helvetica", 11, "bold"), cursor="hand2")
    lbl.pack(padx=20, pady=8)
    
    def on_enter(e):
        btn_frame.configure(bg="#A9B8A4" if bg_color != "#E87A90" else "#d63031")
        lbl.configure(bg="#A9B8A4" if bg_color != "#E87A90" else "#d63031")
    
    def on_leave(e):
        btn_frame.configure(bg=bg_color)
        lbl.configure(bg=bg_color)

    btn_frame.bind("<Enter>", on_enter)
    btn_frame.bind("<Leave>", on_leave)
    lbl.bind("<Enter>", on_enter)
    lbl.bind("<Leave>", on_leave)
    
    btn_frame.bind("<Button-1>", lambda e: command())
    lbl.bind("<Button-1>", lambda e: command())
    return btn_frame

class LauncherApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Antigravity - Installazione")
        self.root.geometry("600x400")
        self.root.configure(bg="#FAFAFA")
        self.root.resizable(False, False)
        
        # Centra la finestra
        self.root.update_idletasks()
        width = self.root.winfo_width()
        height = self.root.winfo_height()
        x = (self.root.winfo_screenwidth() // 2) - (width // 2)
        y = (self.root.winfo_screenheight() // 2) - (height // 2)
        self.root.geometry('{}x{}+{}+{}'.format(width, height, x, y))

        self.title_font = ("Helvetica", 24, "bold")
        self.text_font = ("Helvetica", 13)

        tk.Label(root, text="A N T I G R A V I T Y", font=("Helvetica", 12, "bold"), bg="#FAFAFA", fg="#A9B8A4").pack(pady=(40, 0))
        tk.Label(root, text="File Extractor Cloud", font=self.title_font, bg="#FAFAFA", fg="#2C3E50").pack(pady=(0, 30))

        self.status_var = tk.StringVar(value="Avvio in corso...")
        self.status_label = tk.Label(root, textvariable=self.status_var, font=self.text_font, bg="#FAFAFA", fg="#7F8C8D")
        self.status_label.pack(pady=10)

        style = ttk.Style()
        style.theme_use('default')
        style.configure("TProgressbar", thickness=6, background="#83927A", troughcolor="#EAEAEA", borderwidth=0)
        self.progress = ttk.Progressbar(root, style="TProgressbar", length=400, mode='determinate')
        self.progress.pack(pady=15)

        self.api_frame = tk.Frame(root, bg="#FAFAFA")
        tk.Label(self.api_frame, text="Configurazione Iniziale: Inserisci la tua API Key OpenAI", font=("Helvetica", 11, "bold"), bg="#FAFAFA", fg="#2C3E50").pack(pady=(0, 10))
        self.api_entry = tk.Entry(self.api_frame, font=self.text_font, width=40, show="*", bg="white", fg="#2C3E50", relief="solid", bd=1)
        self.api_entry.pack(pady=5, ipady=4)
        
        self.save_btn = create_custom_button(self.api_frame, "Salva e Avvia", "#83927A", self.save_api_key)
        self.save_btn.pack(pady=15)

        self.api_event = threading.Event()
        self.api_key_value = ""
        self.process = None

        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)
        
        threading.Thread(target=self.run_setup, daemon=True).start()

    def update_status(self, text, progress_val):
        print(f"[*] {text}") # Log to terminal too
        self.root.after(0, lambda: self._update_ui(text, progress_val))

    def _update_ui(self, text, progress_val):
        self.status_var.set(text)
        self.progress['value'] = progress_val

    def prompt_api_key(self):
        self.status_var.set("Richiesta configurazione utente")
        self.api_frame.pack(pady=20)

    def save_api_key(self):
        key = self.api_entry.get().strip()
        if key:
            self.api_key_value = key
            self.api_frame.pack_forget()
            self.api_event.set()

    def run_setup(self):
        try:
            # Cleanup port before starting
            cleanup_port(8000)
            
            self.update_status("Controllo ambiente virtuale Python...", 10)
            if not VENV_DIR.exists():
                self.update_status("Creazione ambiente isolato (l'operazione richiede un minuto)...", 20)
                creation_info = None
                if os.name == 'nt':
                    creation_info = subprocess.STARTUPINFO()
                    creation_info.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                subprocess.run([sys.executable, "-m", "venv", str(VENV_DIR)], startupinfo=creation_info)

            python_exe = VENV_DIR / "Scripts" / "python.exe" if os.name == 'nt' else VENV_DIR / "bin" / "python"

            self.update_status("Sincronizzazione librerie AI e Database (Attendere)...", 40)
            creation_info = None
            if os.name == 'nt':
                creation_info = subprocess.STARTUPINFO()
                creation_info.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            
            self.update_status("Verifica Integrità Librerie (Attendere)...", 45)
            # EXHAUSTIVE CHECK: Verify all critical modules are available
            check_script = "import pandas; import docx; import sqlalchemy; import fastapi; import uvicorn; import openai; print('OK')"
            check_res = subprocess.run([str(python_exe), "-c", check_script], capture_output=True, startupinfo=creation_info)
            
            if b"OK" not in check_res.stdout:
                self.update_status("Sincronizzazione Architettura AI (2-3 min)...", 50)
                # FULL SYNC: Remove -q to ensure completion and install everything explicitly
                # We also include sqlalchemy and openpyxl which were missing in previous checks
                modules = ["pandas", "python-docx", "sqlalchemy", "openai", "fastapi", "uvicorn", "openpyxl", "pymupdf", "python-dotenv", "aiofiles", "python-multipart"]
                for module in modules:
                    self.update_status(f"Installazione {module}...", 50)
                    subprocess.run([str(python_exe), "-m", "pip", "install", module], startupinfo=creation_info)

            self.update_status("Verifica chiavi API...", 60)
            
            # SANITIZATION: Delete corrupted .env (e.g. if mistakenly overwritten with code)
            if ENV_FILE.exists():
                try:
                    with open(ENV_FILE, "r", encoding="utf-8") as f:
                        lines = f.readlines()
                        # If file is too big or lacks KV structure, it's corrupted
                        if len(lines) > 20 or (len(lines) > 0 and "=" not in lines[0]):
                            raise ValueError("Corrupted .env detected")
                except:
                    print("[!] .env corrotto rilevato. Reset in corso...")
                    ENV_FILE.unlink(missing_ok=True)

            if not ENV_FILE.exists():
                self.root.after(0, self.prompt_api_key)
                self.api_event.wait()
                with open(ENV_FILE, "w", encoding="utf-8") as f:
                    f.write(f"OPENAI_API_KEY={self.api_key_value}\n")
            else:
                self.api_event.set()
            
            self.update_status("Avvio del motore di estrazione dati...", 80)
            
            # Log file for debugging
            log_file = open(BASE_DIR / "backend_errors.log", "w", encoding="utf-8")
            
            if os.name == 'nt':
                creation_info = subprocess.STARTUPINFO()
                creation_info.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                self.process = subprocess.Popen(
                    [str(python_exe), "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"],
                    cwd=str(BACKEND_DIR),
                    startupinfo=creation_info,
                    stdout=log_file,
                    stderr=log_file
                )
            else:
                self.process = subprocess.Popen(
                    [str(python_exe), "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"],
                    cwd=str(BACKEND_DIR),
                    stdout=log_file,
                    stderr=log_file
                )

            self.update_status("In attesa della rete locale...", 90)
            server_started = False
            for _ in range(15):
                if is_port_in_use(8000):
                    server_started = True
                    break
                time.sleep(1.0)
                if self.process.poll() is not None: # Process crashed
                    break

            if server_started:
                self.update_status("Sistema Pronto!", 100)
                time.sleep(0.5)
                self.root.after(0, self.show_running_state)
                webbrowser.open("http://127.0.0.1:8000")
            else:
                self.update_status("ERRORE: Il server non risponde. Controlla 'backend_errors.log'", 0)

        except Exception as e:
            self.root.after(0, lambda: self.update_status(f"Errore Critico: {str(e)}", 0))

    def show_running_state(self):
        for widget in self.root.winfo_children():
            widget.destroy()
        
        tk.Label(self.root, text="A N T I G R A V I T Y", font=("Helvetica", 12, "bold"), bg="#FAFAFA", fg="#A9B8A4").pack(pady=(60, 0))
        tk.Label(self.root, text="Sistema Operativo", font=self.title_font, bg="#FAFAFA", fg="#83927A").pack(pady=(0, 10))
        tk.Label(self.root, text="Tutto funziona correttamente in background.", font=self.text_font, bg="#FAFAFA", fg="#7F8C8D").pack(pady=5)
        tk.Label(self.root, text="Non chiudere questa finestra se vuoi usare il programma.", font=("Helvetica", 10, "italic"), bg="#FAFAFA", fg="#95a5a6").pack(pady=(0, 40))
        
        btn_frame = tk.Frame(self.root, bg="#FAFAFA")
        btn_frame.pack(pady=10)
        
        open_btn = create_custom_button(btn_frame, "Vai al Programma", "#DDC8B1", lambda: webbrowser.open("http://127.0.0.1:8000"))
        open_btn.pack(side="left", padx=10)
        
        stop_btn = create_custom_button(btn_frame, "Spegni Sistema", "#E87A90", self.on_closing)
        stop_btn.pack(side="left", padx=10)

    def on_closing(self):
        if self.process:
            self.process.terminate()
        self.root.destroy()
        sys.exit(0)

if __name__ == "__main__":
    root = tk.Tk()
    app = LauncherApp(root)
    root.mainloop()

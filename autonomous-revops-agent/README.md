# Autonomous RevOps Agent

A hackathon prototype that combines CRM, email, calendar, and product-usage data
(all synthetic) to flag potential revenue risks. Python calculates every score;
humans approve every action. Version 1 never contacts real systems.

> Status: Milestone 1 (project setup, sample data, data loading and validation).
> The full README (architecture, risk rules, database tables, limitations) is
> completed in Milestone 8.

## Setup on Windows (PowerShell)

Run all commands from the `autonomous-revops-agent` folder.

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

When activation works, your prompt starts with `(.venv)`.

### If PowerShell blocks activation
Error: "running scripts is disabled on this system". Pick one fix:

1. Allow scripts for this window only:
   `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`
   then run the activation command again.
2. Allow scripts for your user permanently:
   `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`
3. Use Command Prompt (cmd) instead: `.venv\Scripts\activate.bat`
4. Skip activation and call the venv's Python directly:
   `.\.venv\Scripts\python.exe -m pip install -r requirements.txt`

## Check the data (Milestone 1)

```powershell
python -m src.data_loader
```

## Later commands
```powershell
pytest -q               # from Milestone 2 onward
streamlit run app.py    # from Milestone 5 onward
```

## Troubleshooting
- `py is not recognized`: reinstall Python from python.org and tick "Add python.exe to PATH".
- `No module named 'src'`: run from the project root, and use `python -m src.data_loader`
  (not `python src/data_loader.py`).
- `No module named 'pandas'`: the virtual environment is not active, or step 3 of setup was skipped.
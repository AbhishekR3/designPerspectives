"""Regenerate the bundled demo model (src/designperspectives/demo/).

The content is the Internet Banking System example from the C4 model (Simon Brown), following
the "Big Bank plc" example in structurizr/structurizr (Apache-2.0): see NOTICE.

Run from the repository root:  python scripts/make_demo.py
Positions are not set here; the UI lays out each diagram the first time it is opened.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from designperspectives import flows, ops  # noqa: E402
from designperspectives.diagrams import sync_views  # noqa: E402
from designperspectives.sidecar import Sidecar  # noqa: E402
from designperspectives.validate import errors  # noqa: E402
from designperspectives.workspace import dump_json, empty_workspace  # noqa: E402


def build():
    ws = empty_workspace("Big Bank plc")
    ws.description = "Demo: the Internet Banking System example from the C4 model."
    sc = Sidecar()
    E = lambda *a, **k: ops.create_element(ws, *a, **k)  # noqa: E731
    R = lambda *a, **k: ops.create_relationship(ws, *a, **k)  # noqa: E731

    customer = E("person", "Personal Banking Customer", description="A customer of the bank, with personal bank accounts.", external=True)
    support = E("person", "Customer Service Staff", description="Customer service staff within the bank.")
    back_office = E("person", "Back Office Staff", description="Administration and support staff within the bank.")

    ibs = E("softwareSystem", "Internet Banking System", description="Allows customers to view information about their bank accounts, and make payments.")
    mainframe = E("softwareSystem", "Mainframe Banking System", description="Stores all of the core banking information about customers, accounts, transactions, etc.")
    email = E("softwareSystem", "E-mail System", description="The internal Microsoft Exchange e-mail system.")
    atm = E("softwareSystem", "ATM", description="Allows customers to withdraw cash.")

    spa = E("container", "Single-Page Application", ibs, "Provides all of the Internet banking functionality to customers via their web browser.", "JavaScript and Angular")
    mobile = E("container", "Mobile App", ibs, "Provides a limited subset of the Internet banking functionality to customers via their mobile device.", "Xamarin")
    web = E("container", "Web Application", ibs, "Delivers the static content and the Internet banking single page application.", "Java and Spring MVC")
    api = E("container", "API Application", ibs, "Provides Internet banking functionality via a JSON/HTTPS API.", "Java and Spring MVC")
    db = E("container", "Database", ibs, "Stores user registration information, hashed authentication credentials, access logs, etc.", "Oracle Database Schema")

    signin = E("component", "Sign In Controller", api, "Allows users to sign in to the Internet Banking System.", "Spring MVC Rest Controller")
    accounts = E("component", "Accounts Summary Controller", api, "Provides customers with a summary of their bank accounts.", "Spring MVC Rest Controller")
    reset = E("component", "Reset Password Controller", api, "Allows users to reset their passwords with a single use URL.", "Spring MVC Rest Controller")
    security = E("component", "Security Component", api, "Provides functionality related to signing in, changing passwords, etc.", "Spring Bean")
    facade = E("component", "Mainframe Banking System Facade", api, "A facade onto the mainframe banking system.", "Spring Bean")
    email_c = E("component", "E-mail Component", api, "Sends e-mails to users.", "Spring Bean")

    # System level
    R(customer, ibs, "Views account balances, and makes payments using")
    R(customer, support, "Asks questions to", "Telephone")
    R(customer, atm, "Withdraws cash using")
    R(support, mainframe, "Uses")
    R(back_office, mainframe, "Uses")
    R(email, customer, "Sends e-mails to")
    R(atm, mainframe, "Uses")
    R(ibs, mainframe, "Gets account information from, and makes payments using")
    R(ibs, email, "Sends e-mail using")
    # Container level
    R(customer, web, "Visits bigbank.com/ib using", "HTTPS")
    R(customer, spa, "Views account balances, and makes payments using")
    R(customer, mobile, "Views account balances, and makes payments using")
    R(web, spa, "Delivers to the customer's web browser")
    # Component level
    spa_signin = R(spa, signin, "Makes API calls to", "JSON/HTTPS")
    R(spa, accounts, "Makes API calls to", "JSON/HTTPS")
    R(spa, reset, "Makes API calls to", "JSON/HTTPS")
    R(mobile, signin, "Makes API calls to", "JSON/HTTPS")
    R(mobile, accounts, "Makes API calls to", "JSON/HTTPS")
    R(mobile, reset, "Makes API calls to", "JSON/HTTPS")
    signin_sec = R(signin, security, "Uses")
    R(accounts, facade, "Uses")
    R(reset, security, "Uses")
    R(reset, email_c, "Uses")
    sec_db = R(security, db, "Reads from and writes to", "SQL/TCP")
    R(facade, mainframe, "Makes API calls to", "XML/HTTPS")
    R(email_c, email, "Sends e-mail using")

    key = flows.create_flow(ws, "Sign in", "How signing in works in the single-page application.")
    flows.update_flow(
        ws,
        key,
        {
            "steps": [
                {"relationshipId": spa_signin, "description": "Submits credentials to"},
                {"relationshipId": signin_sec, "description": "Validates credentials using"},
                {"relationshipId": sec_db, "description": "select * from users where username = ?"},
                {"relationshipId": sec_db, "description": "Returns user data to", "response": True},
                {"relationshipId": signin_sec, "description": "Returns true if the hashed password matches", "response": True},
                {"relationshipId": spa_signin, "description": "Sends back an authentication token to", "response": True},
            ]
        },
    )
    sync_views(ws)
    flows.sync_flows(ws)
    problems = errors(ws, sc)
    if problems:
        raise SystemExit("\n".join(problems))
    return ws, sc


def main():
    ws, sc = build()
    out = ROOT / "src" / "designperspectives" / "demo"
    out.mkdir(parents=True, exist_ok=True)
    (out / "workspace.json").write_text(dump_json(ws), encoding="utf-8")
    (out / "designperspectives.json").write_text(dump_json(sc.dump()), encoding="utf-8")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()

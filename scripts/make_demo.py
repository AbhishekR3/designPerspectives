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
    ws.description = "Demo: the Internet Banking System example from the C4 model, extended to show every designPerspectives feature (tag groups, lenses, characteristic ratings, cost, linked work, notes, tradeoffs, usage, sensitive labels, symbols, a pipeline connector, and code mapped to components). Ratings, costs and work items are made-up examples."
    sc = Sidecar()
    def E(kind, name, parent=None, description=None, technology=None, **k):  # noqa: N802
        if isinstance(technology, str):
            technology = [t.strip() for t in technology.replace(" and ", ",").split(",")]
        return ops.create_element(ws, kind, name, parent, description, technology, **k)

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
                {"relationshipId": spa_signin, "description": "Submits credentials to", "format": "JSON over HTTPS", "example": 'POST /api/sign-in\n{"username": "alice", "password": "<entered by user>"}'},
                {"relationshipId": signin_sec, "description": "Validates credentials using"},
                {"relationshipId": sec_db, "description": "select * from users where username = ?", "format": "SQL", "example": "select user_id, password_hash from users where username = 'alice'"},
                {"relationshipId": sec_db, "description": "Returns user data to", "response": True, "format": "Row", "example": "USER_ID=1001, PASSWORD_HASH=5e884898da…"},
                {"relationshipId": signin_sec, "description": "Returns true if the hashed password matches", "response": True},
                {"relationshipId": spa_signin, "description": "Sends back an authentication token to", "response": True, "format": "JSON", "example": '200 OK\n{"ok": true, "token": "9f2c41d07a3b5e68"}'},
            ]
        },
    )
    # ---------------------------------------------------------------- showcase additions
    from designperspectives.sidecar import Lens, TagGroup, TagValue

    analytics = E("softwareSystem", "Analytics Platform", description="Collects usage events and loads them, with personal data removed, into the data warehouse.")
    stream = E("container", "Event Stream", analytics, "Carries usage events published by the banking applications.", "Kafka")
    worker = E("container", "Pipeline Worker", analytics, "Runs the nightly job that moves events from the stream into the warehouse.", "Python, Airflow")
    warehouse = E("container", "Data Warehouse", analytics, "Curated, masked usage events for reporting.", "Snowflake")
    consume_c = E("component", "Event Consumer", worker, "Reads batches of events from the Kafka topic.", "Python")
    mask_c = E("component", "PII Masker", worker, "Replaces personal fields with placeholders.", "Python")
    load_c = E("component", "Warehouse Loader", worker, "Writes masked events to Snowflake.", "Python")
    R(api, stream, "Publishes usage events to", "Kafka, JSON", kind="async-message")
    pipe = R(stream, warehouse, "Loads masked events into", "Airflow", kind="data-pipeline")
    ops.update_relationship(ws, pipe, {
        "notes": "Runs nightly at 02:00 UTC. A failed run is retried twice, then pages the data team.",
        "sensitive": [{"item": "User e-mail addresses (before masking)", "level": "restricted"}],
        "codePaths": ["sample_code/pipeline"],
        "stages": [
            {"name": "Consume events", "technologies": ["Kafka", "Python"], "elementId": consume_c, "archType": "queue", "description": "Reads up to 500 events per batch."},
            {"name": "Mask PII", "technologies": ["Python"], "elementId": mask_c, "archType": "pipeline", "description": "Removes user and e-mail fields."},
            {"name": "Load to warehouse", "technologies": ["Snowflake", "Airflow"], "elementId": load_c, "archType": "database"},
        ],
    })

    # Symbols (architecture types)
    for el, arch in [(customer, None), (spa, "web"), (mobile, "mobile"), (web, "web"), (api, "service"), (db, "database"),
                     (email, "cloud"), (stream, "queue"), (worker, "pipeline"), (warehouse, "database"), (mainframe, "service")]:
        if arch:
            ops.update_element(ws, sc, el, {"archType": arch})

    # Tag groups and tags
    sc.tag_groups = [
        TagGroup(name="Risk", values=[TagValue(name="Low", color="#2ca02c"), TagValue(name="Medium", color="#ff7f0e"), TagValue(name="High", color="#d62728")]),
        TagGroup(name="Lifecycle", values=[TagValue(name="Planned", color="#9467bd"), TagValue(name="Live", color="#1f77b4"), TagValue(name="Deprecated", color="#7f7f7f")]),
    ]
    tags = {
        ibs: {"Risk": "Medium", "Lifecycle": "Live"}, mainframe: {"Risk": "High", "Lifecycle": "Live"},
        email: {"Risk": "Low", "Lifecycle": "Live"}, atm: {"Risk": "Medium", "Lifecycle": "Deprecated"},
        analytics: {"Risk": "Medium", "Lifecycle": "Planned"}, api: {"Risk": "High", "Lifecycle": "Live"},
        db: {"Risk": "High", "Lifecycle": "Live"}, spa: {"Risk": "Low", "Lifecycle": "Live"},
        mobile: {"Risk": "Low", "Lifecycle": "Planned"}, warehouse: {"Risk": "Medium", "Lifecycle": "Planned"},
        security: {"Risk": "High", "Lifecycle": "Live"}, facade: {"Risk": "Medium", "Lifecycle": "Live"},
    }
    for el, t in tags.items():
        ops.update_element(ws, sc, el, {"tags": t})

    # Notes, tradeoffs, usage, sensitive information, owner
    ops.update_element(ws, sc, api, {
        "owner": "Digital Channels team",
        "notes": "All customer traffic goes through this container.\nRate limiting is configured at the gateway, not here.",
        "tradeoffs": [
            {"kind": "benefit", "text": "One JSON API serves both the web and mobile clients."},
            {"kind": "cost", "text": "Every client release depends on API compatibility."},
            {"kind": "risk", "text": "Single point of failure for all digital channels."},
        ],
        "usage": [
            {"users": "Personal banking customers", "frequency": "daily", "volume": "about 40,000 active users"},
            {"users": "Customer service staff", "frequency": "hourly"},
        ],
        "sensitive": [{"item": "Account numbers and balances in responses", "level": "confidential"}],
    })
    ops.update_element(ws, sc, db, {
        "notes": "Holds hashed credentials. Backups are encrypted.",
        "sensitive": [{"item": "Hashed authentication credentials", "level": "restricted"}, {"item": "Access logs", "level": "internal"}],
        "tradeoffs": [{"kind": "cost", "text": "Oracle licensing cost grows with core count."}],
    })
    ops.update_element(ws, sc, db, {"details": [
        {"title": "Connection", "columns": ["Setting", "Value"], "rows": [
            ["Host", "ibdb.internal.bigbank.example"], ["Port", "1521"], ["Service name", "IBPROD"],
            ["Credentials", "Vault path secret/ib/db (never store passwords here)"]]},
        {"title": "Table USERS", "columns": ["Column", "Type", "Nullable", "Notes"], "rows": [
            ["USER_ID", "NUMBER", "no", "Primary key"], ["USERNAME", "VARCHAR2(64)", "no", "Unique"],
            ["PASSWORD_HASH", "VARCHAR2(128)", "no", "Salted hash"], ["LAST_LOGIN", "TIMESTAMP", "yes", ""]]},
    ]})
    ops.update_element(ws, sc, warehouse, {"details": [
        {"title": "Connection", "columns": ["Setting", "Value"], "rows": [["Account", "bigbank-analytics"], ["Warehouse", "ANALYTICS_WH"], ["Schema", "USAGE_EVENTS"]]}]})
    ops.update_element(ws, sc, mainframe, {
        "usage": [{"users": "Back office staff", "frequency": "continuous"}],
        "tradeoffs": [{"kind": "risk", "text": "Batch windows limit how fresh balances can be."}],
    })
    ops.update_relationship(ws, spa_signin, {"notes": "Credentials are sent in the request body, never in the URL.", "sensitive": [{"item": "User credentials in transit", "level": "restricted"}]})

    # Code mapped to components (C4 level)
    for el, paths in [(signin, ["sample_code/api/sign_in.py", "sample_code/api/security.py", "sample_code/api/store.py"]),
                      (accounts, ["sample_code/api/accounts.py", "sample_code/api/mainframe_facade.py", "sample_code/api/store.py"]),
                      (reset, ["sample_code/api/reset_password.py", "sample_code/api/security.py", "sample_code/api/email_sender.py", "sample_code/api/store.py"]),
                      (security, ["sample_code/api/security.py", "sample_code/api/store.py"]),
                      (facade, ["sample_code/api/mainframe_facade.py"]),
                      (email_c, ["sample_code/api/email_sender.py"]),
                      (consume_c, ["sample_code/pipeline/consume.py"]), (mask_c, ["sample_code/pipeline/mask_pii.py"]),
                      (load_c, ["sample_code/pipeline/load_warehouse.py"])]:
        ops.update_element(ws, sc, el, {"codePaths": paths})

    # Architecture characteristics (1-5) and monthly cost. Example values for the demo, not measurements.
    def chars(*rows):
        return [dict(name=n, rating=r, **({"driving": True} if d else {}), **({"note": t} if t else {})) for n, r, d, t in rows]

    def cost(*rows):
        return [dict(item=i, monthly=m, **({"note": t} if t else {})) for i, m, t in rows]

    for el, c, k in [
        (spa, chars(("Scalability", 5, True, "Static files served from a CDN"), ("Deployability", 4, False, ""), ("Testability", 3, False, "")),
         cost(("CDN and static hosting", 40, ""))),
        (mobile, chars(("Deployability", 2, False, "App-store review delays releases"), ("Testability", 2, False, ""), ("Performance", 4, False, "")),
         cost(("App store accounts", 10, ""), ("Device test lab", 150, ""))),
        (web, chars(("Scalability", 3, False, ""), ("Deployability", 3, False, ""), ("Availability", 4, True, "")), cost(("Cloud Run, 2 instances", 180, ""))),
        (api, chars(("Scalability", 3, True, "Stateless; scales horizontally behind the load balancer"), ("Performance", 3, True, "Mainframe calls dominate latency"),
                    ("Availability", 4, True, ""), ("Deployability", 3, False, "Single deployment unit"), ("Testability", 4, False, ""), ("Security", 4, True, "")),
         cost(("Kubernetes nodes, 3 x n2-standard-4", 1150, ""), ("Load balancer", 60, ""))),
        (db, chars(("Scalability", 2, False, "Vertical scaling only"), ("Availability", 4, True, "Data Guard standby"), ("Fault tolerance", 3, False, "")),
         cost(("Oracle licences", 4200, "Prorated per month"), ("Storage and backups", 380, ""))),
        (mainframe, chars(("Scalability", 1, False, ""), ("Deployability", 1, False, "Quarterly release window"), ("Availability", 5, True, ""), ("Evolvability", 1, False, "")),
         cost(("Mainframe MIPS share", 9500, "Internal chargeback"))),
        (email, chars(("Availability", 4, False, "")), cost(("E-mail licences", 120, ""))),
        (stream, chars(("Scalability", 5, True, ""), ("Elasticity", 4, False, ""), ("Fault tolerance", 4, True, "Replication factor 3")), cost(("Managed Kafka", 640, ""))),
        (worker, chars(("Scalability", 2, False, "Single scheduler"), ("Testability", 3, False, ""), ("Deployability", 4, False, "")), cost(("Airflow workers", 320, ""))),
        (warehouse, chars(("Scalability", 5, False, ""), ("Performance", 4, False, ""), ("Security", 4, True, "PII masked before load")), cost(("Warehouse credits", 2100, ""))),
        (security, chars(("Security", 4, True, ""), ("Testability", 3, False, "")), []),
        (signin, chars(("Testability", 4, False, "")), []),
        (facade, chars(("Testability", 2, False, "Needs a mainframe test region"), ("Fault tolerance", 2, False, "No circuit breaker yet")), []),
        (mask_c, chars(("Security", 5, True, ""), ("Testability", 4, False, "")), []),
    ]:
        ops.update_element(ws, sc, el, {"characteristics": c, "cost": k})

    # Linked work: security issues, pull requests, issues, backlog items, required updates (examples).
    for el, work in [
        (security, [{"type": "security", "title": "Password hashing uses SHA-1; move to bcrypt", "status": "in-progress", "severity": "critical", "url": "https://example.com/security/101"}]),
        (api, [{"type": "pr", "title": "Add rate limiting to the accounts API", "status": "open", "url": "https://example.com/pulls/42"},
               {"type": "security", "title": "Upgrade the JSON library (known deserialisation issue)", "status": "open", "severity": "high"}]),
        (mobile, [{"type": "update", "title": "Migrate off the current mobile framework", "status": "open", "severity": "medium"}]),
        (facade, [{"type": "backlog", "title": "Add a circuit breaker around mainframe calls", "status": "open", "severity": "medium"}]),
        (worker, [{"type": "issue", "title": "Nightly job retries forever on bad events", "status": "blocked", "severity": "low"}]),
        (db, [{"type": "backlog", "title": "Partition the audit table", "status": "open", "severity": "low"}]),
    ]:
        ops.update_element(ws, sc, el, {"work": work})
    ops.update_relationship(ws, spa_signin, {"work": [{"type": "update", "title": "Move to TLS 1.3 only", "status": "open", "severity": "medium"}]})

    # Styling examples
    ops.set_style(ws, sc, atm, {"fill": "#33293f", "strokeStyle": "dashed"})
    ops.set_style(ws, sc, pipe, {"stroke": "#9467bd", "strokeWidth": 3})

    # Lenses
    sc.lenses = [
        Lens(id="security-review", name="Security review", visible_levels=["context", "container", "component"], default_overlay="Risk",
             visible_sections=["technology", "characteristics", "work", "details", "notes", "sensitive", "tradeoffs"]),
        Lens(id="product-owner", name="Product owner", visible_levels=["landscape", "context", "container"], default_overlay="Lifecycle",
             hidden_tag_groups=["Risk"], visible_sections=["cost", "work", "notes", "usage"], show_technology=False),
    ]

    key2 = flows.create_flow(ws, "Publish usage event", "How a usage event reaches the warehouse.")
    flows.update_flow(ws, key2, {"steps": [
        {"relationshipId": ops.build_index(ws).elements[api].relationships[-1].id, "description": "Publishes event to"},
        {"relationshipId": pipe, "description": "Nightly job loads masked events into"},
    ]})

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

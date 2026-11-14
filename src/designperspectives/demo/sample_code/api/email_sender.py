"""Sends e-mails through the E-mail System."""


def send(to: str, subject: str, body: str) -> None:
    print(f"mail to {to}: {subject}\n{body}")

// Hand-written sample for W0-SPIKE-STRUCTURIZR (fictional internet banking system).
// Follows docs.structurizr.com/dsl/language as read at structurizr/structurizr.github.io@530a964.
// NOT parsed by the Structurizr DSL parser in this spike (no JVM/Maven Central access) - see report.
workspace "Internet Banking (sample)" "Minimal designPerspectives export sample." {

    !identifiers hierarchical
    !impliedRelationships false

    model {
        properties {
            "designperspectives.schema" "0.2"
        }

        customer = person "Personal Banking Customer" "A customer of the bank, with personal bank accounts." "Customer"

        group "Big Bank plc" {
            ibs = softwareSystem "Internet Banking System" "Allows customers to view information about their bank accounts and make payments." {
                properties {
                    "dp.owner" "team-digital-banking"
                }
                perspectives {
                    "Ownership" "Owned by the Digital Banking team" "team-digital-banking"
                }

                web = container "Web Application" "Delivers the single-page banking UI to the customer's browser." "TypeScript and React" "Web Browser"
                api = container "API Application" "Provides internet banking functionality via a JSON/HTTPS API." "Java and Spring MVC" {
                    signin = component "Sign In Controller" "Allows users to sign in to the Internet Banking System." "Spring MVC Rest Controller"
                    accounts = component "Accounts Summary Controller" "Provides customers with a summary of their bank accounts." "Spring MVC Rest Controller"
                    mainframeFacade = component "Mainframe Banking System Facade" "A facade onto the mainframe banking system." "Spring Bean"
                }
                db = container "Database" "Stores user registration information, hashed credentials and access logs." "PostgreSQL" "Database"
            }
            mainframe = softwareSystem "Mainframe Banking System" "Stores all of the core banking information about customers, accounts and transactions." "Existing System"
            email = softwareSystem "E-mail System" "The internal e-mail system." "Existing System"
        }

        // system level
        customer -> ibs "Views account balances and makes payments using"
        ibs -> mainframe "Gets account information from, and makes payments using"
        ibs -> email "Sends e-mail using"
        email -> customer "Sends e-mails to"

        // container level
        customer -> ibs.web "Views account balances using" "HTTPS"
        ibs.web -> ibs.api "Makes API calls to" "JSON/HTTPS"
        ibs.api -> ibs.db "Reads from and writes to" "SQL/TCP"
        ibs.api -> mainframe "Makes API calls to" "XML/HTTPS"
        ibs.api -> email "Sends e-mail using" "SMTP" "Asynchronous"

        // component level
        ibs.web -> ibs.api.signin "Makes API calls to" "JSON/HTTPS"
        ibs.web -> ibs.api.accounts "Makes API calls to" "JSON/HTTPS"
        ibs.api.signin -> ibs.db "Reads from and writes to" "SQL/TCP"
        ibs.api.accounts -> ibs.api.mainframeFacade "Uses"
        ibs.api.mainframeFacade -> mainframe "Makes API calls to" "XML/HTTPS"
    }

    views {
        systemContext ibs "SystemContext" "System context for the Internet Banking System." {
            title "Internet Banking System - System Context"
            include customer ibs mainframe email
        }

        container ibs "Containers" "Containers of the Internet Banking System." {
            title "Internet Banking System - Containers"
            include customer ibs.web ibs.api ibs.db mainframe email
        }

        component ibs.api "Components" "Components of the API Application." {
            title "API Application - Components"
            include ibs.web ibs.api.signin ibs.api.accounts ibs.api.mainframeFacade ibs.db mainframe
        }

        styles {
            element "Database" {
                shape Cylinder
            }
            element "Person" {
                shape Person
            }
        }
    }
}

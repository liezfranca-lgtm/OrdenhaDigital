# Executa um arquivo .sql (ou uma consulta) no banco do OrdenhaDigital.
# Uso: ORDENHA_DB_SENHA=... python runsql.py arquivo.sql   |   python runsql.py -c "select 1"
import os, sys, psycopg2
conn = psycopg2.connect(host='aws-0-us-east-2.pooler.supabase.com', port=5432, dbname='postgres',
                        user='postgres.vnlaxudshuzmwnvoyybv', password=os.environ['ORDENHA_DB_SENHA'], sslmode='require')
conn.autocommit = True
cur = conn.cursor()
sql = sys.argv[2] if sys.argv[1] == '-c' else open(sys.argv[1], encoding='utf-8').read()
cur.execute(sql)
if cur.description:
    print(' | '.join(d[0] for d in cur.description))
    for r in cur.fetchall(): print(' | '.join(str(x) for x in r))
else:
    print('OK')

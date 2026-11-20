import sqlite3, pathlib
root=pathlib.Path(r"C:\Users\johni\OneDrive\Рабочий стол\сайт OldWeb")
con=sqlite3.connect(':memory:')
con.execute('PRAGMA foreign_keys=ON')
for p in sorted((root/'migrations').glob('*.sql')):
    print('applying',p.name)
    con.executescript(p.read_text(encoding='utf-8'))
    con.commit()
for table in ['settings','servers','privileges','news','rules','purchases','users','sessions']:
    print(table, con.execute(f'select count(*) from {table}').fetchone()[0])
print('settings', con.execute('select key,value from settings').fetchall())


import asyncio, uuid, sys
sys.path.insert(0, '/Users/thahasingandluri/Downloads/energy-intelligence 2/backend')
from app.models.database import AsyncSessionLocal, Project

PROJECTS = [
    ('Sunflower Solar Farm','solar','8point3 Energy Partners','Kern County','CA',20.0,'planned'),
    ('Lost Hills Solar','solar','First Solar','Kern County','CA',20.0,'planned'),
    ('Blythe Power Project','solar','NRG Energy','Blythe','CA',579.0,'operational'),
    ('Cimarron Solar Project','solar','NRG Yield','Lubbock','TX',150.0,'planned'),
    ('Wind Ranch','wind','NRG Energy','Frisco','TX',200.0,'under_construction'),
    ('Red Rock Solar Project','solar','NRG Energy','San Luis Valley','CO',15.0,'under_construction'),
    ('Duck Creek Solar Project','solar','NRG Energy','Morgan County','UT',20.0,'planned'),
    ('Mesa Grande Solar Project','solar','NRG Yield','La Paz','AZ',30.0,'planned'),
    ('Topock Generating Station','hydro','NRG Energy','Topock','AZ',110.0,'operational'),
    ('Tecate Energy Project','wind','NRG Energy',None,'CA',500.0,'operational'),
    ('Apache Solar II','solar','NRG Energy','Bullhead City','AZ',150.0,'operational'),
    ('Lone Star Wind Farm Phase III','wind','NRG Energy',None,'TX',150.0,'planned'),
    ('Pine Ridge Solar Project','solar','ITC Holdings','Rapid City','SD',100.0,'planned'),
    ('Pioneer Ridge Solar Project','solar','ITC Holdings','Cannon Ball','ND',100.0,'planned'),
    ('Dakota Prairie Solar Project','solar','ITC Holdings','Regent','ND',100.0,'planned'),
    ('Buffalo Ridge Solar Project','solar','ITC Holdings','Sully','SD',100.0,'planned'),
    ('Wind River Solar','solar','Otter Tail Corp','Wheatland','WY',None,'planned'),
    ('North Bluff Wind Project','wind','Enbridge',None,None,150.0,'planned'),
    ('Glenora Solar Project','solar','Enbridge','Kootenay Bay',None,24.0,'approved'),
    ('Battery Storage Facility Austin','battery','NRG Energy','Austin','TX',50.0,'under_construction'),
    ('Blythe Solar Project','solar','NRG Energy','Blythe','CA',550.0,'operational'),
    ('Solar Star Nevada','solar','NRG Energy','Las Vegas','NV',136.5,'planned'),
    ('Dale Hollow Hydro','hydro','NRG Energy','Lynchburg','VA',240.0,'operational'),
    ('Canyon SunZephyr Solar','solar','NRG Energy','Moore','OK',20.0,'planned'),
    ('Pecos River Wind Project','wind','NRG Energy','Pecos','TX',367.5,'planned'),
    ('Tolvo Solar Project','solar','ITC Holdings','Alamosa','CO',30.0,'planned'),
    ('Pueblo Solar Project','solar','ITC Holdings','Pueblo','CO',30.0,'planned'),
    ('Rio Grande Hydro','hydro','Enbridge',None,None,2.8,'planned'),
    ('Sunny Point Solar','solar','NRG Energy','Moapa','NV',250.0,'operational'),
    ('Blue Mountain Solar II','solar','NRG Energy','Dover','DE',10.0,'operational'),
    ('Crested Butte Solar','solar','ITC Holdings','Crested Butte','CO',30.0,'planned'),
    ('Wolfe Island Solar','solar','NRG Yield','Kingston','ON',35.0,'operational'),
    ('Eagle Bend Solar','solar','NRG Energy',None,'TX',30.0,'planned'),
    ('Palo Verde Solar','solar','NRG Energy','Jensen Beach','FL',20.0,'planned'),
    ('Lost Creek Solar','solar','NRG Energy','Wilmington','NC',20.0,'under_construction'),
    ('Apache Wind Farm II','wind','NRG Energy','Bullhead City','AZ',150.0,'planned'),
    ('Topock Solar Project','solar','NRG Energy','Topock','AZ',100.0,'operational'),
    ('Wisconsin Renewable Energy','solar','Wisconsin Electric','Madison','WI',None,'planned'),
    ('Texas Battery Storage','battery','Tesla',None,'TX',25.0,'planned'),
    ('Red Rock Solar Farm','solar','Tesla','Bullhead City','AZ',100.0,'under_construction'),
]

async def restore():
    async with AsyncSessionLocal() as db:
        count = 0
        for name,ptype,owner,city,state,cap,stage in PROJECTS:
            p = Project(
                id=uuid.uuid4(),
                project_name=name,
                project_name_normalized=name.lower().strip(),
                project_type=ptype,
                owner_company=owner,
                city=city,
                state=state,
                country='USA',
                capacity_mw=cap,
                lifecycle_stage=stage,
                overall_confidence=0.80,
            )
            db.add(p)
            count += 1
        await db.commit()
        print(f'Restored {count} projects!')

asyncio.run(restore())

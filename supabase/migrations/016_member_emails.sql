-- 016: assign email addresses to the chapter roster (public.members.email).
-- Matches on lower-cased, whitespace-collapsed name, ignoring a trailing "(inactive)" tag.
-- The roster has two Nitin Sharmas ("Nitin Sharma" and "Nitin Sharma- Chef"), so those two are
-- matched separately: the Chef address goes only to a name containing "chef", the other only
-- to a name that is exactly "Nitin Sharma".
-- Safe to re-run. Run it in the Supabase SQL editor (or `supabase db push`).

with src(name, email) as (values
  ('Abhay Goenka', 'sgoel2309@gmail.com'),
  ('Abhay Mehta', 'abhaymehta@delhicabz.com'),
  ('Abhishek Aggarwal', 'admin@redmint.net'),
  ('Ambika Gupta', 'ambikagupta04@gmail.com'),
  ('Amit Bahl', 'daatindia@gmail.com'),
  ('Amit Chandna', 'amitchandnafbd@gmail.com'),
  ('Amit Gupta', 'amitgupta73@live.com'),
  ('Amit Tambi', 'amit@colouredge.in'),
  ('Amitoj Singh Jolly', 'delhisales@ivpro.in'),
  ('Annie Jain', 'decorinndesigns@gmail.com'),
  ('Arminderpal Singh', 'arminderpal2007@gmail.com'),
  ('Arun Ahuja', 'rgrfinsolutions@gmail.com'),
  ('Ashok Bhasin', 'akb865@gmail.com'),
  ('Ashutosh Nagar', 'ashutoshnagar@analaw.in'),
  ('Ashwani Kumar', 'ashwani1967@gmail.com'),
  ('Atul Mangal', 'atul@camangal.com'),
  ('Chandeep Singh Chhatwal', 'chandeep@dekorcompany.com'),
  ('Divya Shakti Bajaj', 'dsbajaj0402@gmail.com'),
  ('Dr. Hemesh Thakur', 'homeopathy1796@gmail.com'),
  ('Garima Agarwal', 'garimaa@interactbeyond.in'),
  ('Harshdeep Singh Chowdhary', 'harsh@evolvedhair.com.au'),
  ('Hemant Suri', 'info@adesignersworld.co.in'),
  ('Himanshu Sharma', 'himanshu@workbeeindia.com'),
  ('Kajal Gupta', 'kajalgupta7910@gmail.com'),
  ('Kajal Nagrath', 'kajal13win@gmail.com'),
  ('Keshav Verma', 'keshav@ecomategroup.com'),
  ('Komal Gupta', 'komal@passionworkx.com'),
  ('Kompal Bhardwaj', 'kompal@dsignerstudio.com'),
  ('Kunal Singh Saini', 'kunal.saini@kssinteriors.com'),
  ('Kunnal Gupta', 'kunal@aarceeawnings.com'),
  ('Monica Singh', 'monicadlf@yahoo.com'),
  ('Naveen Aggarwal', 'ashe.naveen@gmail.com'),
  ('Neraj K Anand', 'mbs69@hotmail.com'),
  ('Nishant Tanwar', 'advnishant03@gmail.com'),
  ('Nitin Sharma', 'alfa3260@gmail.com'),
  ('Nitin Sharma- Chef', 'chefskitchencaterers@gmail.com'),
  ('Piyush Puri', 'contact@meroyinc.com'),
  ('Pramod Aggarwal', 'electrikainc@gmail.com'),
  ('Pranati Bajaj', 'bajaj.pranati@gmail.com'),
  ('Pranav Agarwal', 'pranavagarrwal@gmail.com'),
  ('Priyatna Basu', 'basupriyatna@gmail.com'),
  ('Rahul Bajaj', 'naincy.bajaj888@gmail.com'),
  ('Rahul Matharu', 'rahul_matharu@handysolver.com'),
  ('Rahul Wadhwa', 'rahulwadhwa1006@yahoo.com'),
  ('Rajesh Kumar Agarwal', 'carajesh.radhey@gmail.com'),
  ('Rajesh Kumar Gupta', 'info@kanhaengg.com'),
  ('Ramlal Sagwal', 'ramlalsagwal@gmail.com'),
  ('Ranjan K Sapra', 'rks@pest-cure.com'),
  ('Ribhu Sehgal', 'ribhu@networthprojects.com'),
  ('Richa Mongia', 'richamongia@gmail.com'),
  ('Ritu Chauhan', 'rchauhan@raaas.com'),
  ('Rohit Chander Sethi', 'rohitchander15180@gmail.com'),
  ('Rohit Kumar', 'arryainfra@gmail.com'),
  ('Rudhir Bhalla', 'rudhirbhalla@gmail.com'),
  ('Rushaal Panwar', 'rushaal@orangeevents.in'),
  ('Sandeep Deshwal', 'sandeepdeshwal85@gmail.com'),
  ('Sanjay Jain', 'sanjayjain.hello@yahoo.com'),
  ('Shaifali Khanna', 'shaifalikhanna09@gmail.com'),
  ('Shalini Chaudhry', 'info@aletas.in'),
  ('Shubham Pahuja', 'gurgaon@kcoverseas.com'),
  ('Sumit Jain', 'mahadevmarble10@gmail.com'),
  ('Sunil Bindra', 'sunilbindra@hotmail.com'),
  ('Sunil Vashisht', 'pandit_sunilsharma@yahoo.co.in'),
  ('Suraj Yadav', 'suraj@velinoop.com'),
  ('Surender Singh Khangura', 'surender@ascentinfra.co.in'),
  ('Suryaditya Bose', 'info@soleil-atelier.com'),
  ('Tanvi Dhamija', 'tandhamija@gmail.com'),
  ('Tarun Mohan Chopra (inactive)', 'cstarunchopra@gmail.com'),
  ('Tarun Rajput', 'tarunrajput1978@gmail.com'),
  ('Usha Kumar', 'minikumar2008@gmail.com'),
  ('Vaini Mehra', 'getshaadivibes@gmail.com'),
  ('Vinod Kumar Khatri', 'vinodkhatri17@gmail.com'),
  ('Vinu Vishvanathan', 'vinu@hypronline.com'),
  ('Vipul Sharma', 'vipul@sesipl.co.in'),
  ('Viraj Bansal', 'virajbansal@gmail.com'),
  ('Vivek Kakar', 'vivek@vivekfinancial.com'),
  ('Yoginder Kalra', 'yoginderkalra_1982@yahoo.co.in')
),
norm as (
  select regexp_replace(lower(trim(regexp_replace(name, '\s*\(inactive\)', '', 'i'))), '\s+', ' ', 'g') as key,
         name, email
  from src
),
target as (
  select m.id, n.email
  from public.members m
  join norm n
    on regexp_replace(lower(trim(regexp_replace(m.name, '\s*\(inactive\)', '', 'i'))), '\s+', ' ', 'g') = n.key
  where n.name not like 'Nitin Sharma%'
  union all
  select m.id, 'chefskitchencaterers@gmail.com'
  from public.members m
  where lower(m.name) like 'nitin sharma%chef%'
  union all
  select m.id, 'alfa3260@gmail.com'
  from public.members m
  where lower(trim(m.name)) = 'nitin sharma'
)
update public.members m
set email = t.email
from target t
where m.id = t.id;

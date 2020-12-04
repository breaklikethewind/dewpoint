// RTI DewPoint Driver
// Copyright 2011 Remote Technologies Inc.
//
// $Header: /XP8/Utility/DewPoint/DewPoint.js 10    12/30/15 10:25a Ericn $

// Formula:
//  Tdp=243.04*(LN(Hr/100)+((17.625*T)/(243.04+T)))/(17.625-LN(Hr/100)-((17.625*T)/(243.04+T)))
//
//  Tdp: Dewpoint temp in celsius
//  Hr: Relative humidity
//  T: Temperature celsius
//
// Fahrenheit, Celsius conversion
//  Tc=(Tf-32)*5/9
//  Tf=Tc*(9/5)+32
//
//  Tf: Temperature Fahrenheit
//  Tc: Temperature Celsius


//  Globals
var g_Zone = new Array();
var g_Debug = Boolean(Config.Get("DebugTrace") == "true");
var g_MaxZones = 0;

System.Print("DewPoint: Initializing Driver\r\n");

function Print(str)
{
	System.Print("DewPoint: " + str);
}

function DebugPrint(str)
{
	if (g_Debug)
		Print(str);
}

function DewpointCelsius(Temp, Humidity)
{
	numerator = 243.04*(Math.log(Humidity/100.0)+((17.625*Temp)/(243.04+Temp)));
	denominator = (17.625-Math.log(Humidity/100.0)-((17.625*Temp)/(243.04+Temp)));
	
	return numerator / denominator;
}

function TempCelsius(TempF)
{
	return (TempF-32.0)*5.0/9.0;
}

function TempFahrenheit(TempC)
{
	return TempC*(9.0/5.0)+32.0;
}

// Define a dewpoint zone
function Zone(i)
{
	// Device enumeration
	this.Index = i;
	this.ZoneName = Config.Get("ZoneName" + i);
	
	// Zone parameters
	this.UnitsFahrenheit = Boolean(Config.Get("UnitsFahrenheit" + i) == "true");
	this.TemperatureSysvarID = parseInt(Config.Get("TemperatureSysvar" + i));	
	this.TemperatureDivisor = parseInt(Config.Get("TemperatureDivisor" + i));	
	this.HumiditySysvarID = parseInt(Config.Get("HumiditySysvar" + i));
	this.DehumidifyDelta = parseInt(Config.Get("DehumidifyDelta" + i));
	this.InletZoneName = Config.Get("InletZone" + i);
	this.OpenInletMacroID = parseInt(Config.Get("OpenInletMacro" + i));
	this.CloseInletMacroID = parseInt(Config.Get("CloseInletMacro" + i));
	
	// Zone calculations
	this.LastDewpoint = 0.0;
	this.CurrentDewpoint = 0.0;
	this.InletOpen = false;
}

function ZoneNameToIndex(name)
{
	// Find the index of the device
	i = 0;
	do {
		i++;
	} while ( (i < g_MaxZones) && (g_Zone[i].ZoneName != name) );
	
	if (i <= g_MaxZones)
		return i;
	else
		return 0;
}

function FindOutletZoneFromInlet(zonenum)
{
	i = 0;
	do {
		i++;
	} while ( (i < g_MaxZones) && (g_Zone[zonenum].ZoneName != g_Zone[i].InletZoneName) );
	
	if (i <= g_MaxZones)
		return i;
	else
		return 0;

}

function TestSwitchBaffle(zonenum, InletIndex)
{
	// Is this zone an outlet?
	inletzone = FindOutletZoneFromInlet(zonenum);
	if (inletzone == 0)
		inletzone = zonenum;
	
	// Do we have an inlet zone baffle?
	if (g_Zone[inletzone].InletZoneName.length)
	{
		DebugPrint("Inlet zone (" + InletIndex +") " + g_Zone[inletzone].InletZoneName);
		
		// Is the inlet DP rising or falling?
		if (g_Zone[InletIndex].CurrentDewpoint > g_Zone[InletIndex].LastDewpoint)
		{
			// Rising DP (inlet zone getting wetter)	
			DebugPrint("Inlet zone rising");
			
			if (g_Zone[inletzone].InletOpen) // If inlet is open
			{
				if (!isNaN(g_Zone[inletzone].CloseInletMacroID))
				{
					DebugPrint("Running macro " + g_Zone[inletzone].CloseInletMacroID);
					System.RunSystemMacro(g_Zone[inletzone].CloseInletMacroID);
				}
				
				DebugPrint("Setting Event " + "CloseEventName" + inletzone);
				System.SignalEvent("CloseEventName" + inletzone);
			
				g_Zone[inletzone].InletOpen = false;	
			}						
		}
		else
		{
			// Falling DP (inlet zone getting dryer)			
			DebugPrint("Inlet zone falling");
		
			if (!g_Zone[inletzone].InletOpen) // If inlet is closed
			{
				// Is the dewpoint differance low enough in the inlet zone to open baffle?
				if (g_Zone[inletzone].CurrentDewpoint > (g_Zone[inletzone].DehumidifyDelta + g_Zone[InletIndex].CurrentDewpoint))
				{
					if (!isNaN(g_Zone[inletzone].OpenInletMacroID))
					{
						DebugPrint("Running macro " + g_Zone[inletzone].OpenInletMacroID);
						System.RunSystemMacro(g_Zone[inletzone].OpenInletMacroID);
					}
					
					DebugPrint("Setting Event " + "OpenEventName" + inletzone);
					System.SignalEvent("OpenEventName" + inletzone);
					
					g_Zone[inletzone].InletOpen = true;
				}
			}
		}
	}
}

function CalcDewpointSysvar(zonenum)
{
	if (zonenum <= g_MaxZones)
	{
		Temp = SystemVars.Read(g_Zone[zonenum].TemperatureSysvarID);
		if (g_Zone[zonenum].TemperatureDivisor > 1)
			Temp = Temp / g_Zone[zonenum].TemperatureDivisor;

		// If we are in Fahrenheit mode convert to Celsius for dewpoint calculation
		if (g_Zone[zonenum].UnitsFahrenheit)
		{
			DebugPrint("Convert " + Temp + " to Celsius");
			Temp = TempCelsius(Temp);
		}
		
		Humidity = SystemVars.Read(g_Zone[zonenum].HumiditySysvarID);
		DebugPrint("Calc dewpoint from " + Temp + "C and " + Humidity + "%");
		dp = DewpointCelsius(Temp, Humidity);
		
		// If we are in Fahrenheit mode convert dewpoint result to Fahrenheit
		if (g_Zone[zonenum].UnitsFahrenheit)
		{
			DebugPrint("Convert dewpoint " + dp + " to Fahrenheit");
			dp = TempFahrenheit(dp);
		}
		
		g_Zone[zonenum].LastDewpoint = g_Zone[zonenum].CurrentDewpoint;
		g_Zone[zonenum].CurrentDewpoint = dp;

		SystemVars.Write("DewPoint" + zonenum, Math.round(g_Zone[zonenum].CurrentDewpoint));
		
		DebugPrint(g_Zone[zonenum].ZoneName + " Dew Point: " + g_Zone[zonenum].CurrentDewpoint);
		
		InletIndex = ZoneNameToIndex(g_Zone[zonenum].InletZoneName);

		TestSwitchBaffle(zonenum, InletIndex);
	}
}

// Identify the number of zones
for (var i = 1; i <= 10; i++) {
	// get the strings from Config
	var ZoneName = Config.Get("ZoneName" + i);
	
	if (ZoneName != "") { // If there is a name, then we have a zone to calculate
		g_MaxZones++;
		
		g_Zone[i] = new Zone(i);
		
		if (!SystemVars.AddSubscription(g_Zone[i].TemperatureSysvarID))
			g_Zone[i].TemperatureSysvarID = undefined;
		else
			DebugPrint("Add Temperature Subscription #" + g_Zone[i].TemperatureSysvarID + ": " + g_Zone[i].ZoneName);
		
		if (!SystemVars.AddSubscription(g_Zone[i].HumiditySysvarID))
			g_Zone[i].HumiditySysvarID = undefined;
		else
			DebugPrint("Add Humidity Subscription #" + g_Zone[i].HumiditySysvarID + ": " + g_Zone[i].ZoneName);
		
		DebugPrint("Added Dewpoint Zone: (" + i + ") " + g_Zone[i].ZoneName);
	}
}

// Handle all sysvar triggers
SystemVars.OnSysVarChangeFunc = SysvarChange;
function SysvarChange(varnum)
{
	var i = 0;
	
	// Find the index of the device
	i = 0;
	do {
		i++;
	} while ( (i < g_MaxZones) && (g_Zone[i].TemperatureSysvarID != varnum) && (g_Zone[i].HumiditySysvarID != varnum) );
		
	if (i <= g_MaxZones)
	{
		DebugPrint("Updating Dewpoint Zone: (" + i + ") " + g_Zone[i].ZoneName);
		CalcDewpointSysvar(i);
	}
}











